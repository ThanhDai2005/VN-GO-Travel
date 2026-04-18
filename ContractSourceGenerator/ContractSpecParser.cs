using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace ContractSourceGenerator;

internal static class ContractSpecParser
{
    public static bool TryParse(string text, out ContractSpec? spec, out string? error)
    {
        spec = null;
        error = null;
        var tree = CSharpSyntaxTree.ParseText(text, CSharpParseOptions.Default.WithLanguageVersion(LanguageVersion.Latest));
        var root = tree.GetCompilationUnitRoot();
        var classDecl = root.DescendantNodes().OfType<ClassDeclarationSyntax>()
            .FirstOrDefault(c => c.Identifier.Text == "EventContractV1");
        if (classDecl is null)
        {
            error = "Could not find class EventContractV1.";
            return false;
        }

        if (!TryParseStringConst(classDecl, "Version", out var version) ||
            !TryParseStringConst(classDecl, "VersionPropertyName", out var versionPropertyName))
        {
            error = "Could not parse Version / VersionPropertyName string constants.";
            return false;
        }

        if (!TryFindStaticReadOnlyCollection(classDecl, "Fields", out var fieldsCollection, out error))
            return false;

        if (!TryParseWireFields(fieldsCollection, out var fields, out error))
            return false;

        if (!TryFindStaticReadOnlyCollection(classDecl, "Enums", out var enumsCollection, out error))
            return false;

        if (!TryParseWireEnums(enumsCollection, out var enums, out error))
            return false;

        spec = new ContractSpec(version, versionPropertyName, fields, enums);
        return true;
    }

    private static bool TryParseStringConst(ClassDeclarationSyntax classDecl, string name, out string value)
    {
        value = "";
        foreach (var member in classDecl.Members)
        {
            if (member is not FieldDeclarationSyntax fds)
                continue;
            foreach (var variable in fds.Declaration.Variables)
            {
                if (variable.Identifier.Text != name)
                    continue;
                if (variable.Initializer?.Value is LiteralExpressionSyntax les &&
                    les.IsKind(SyntaxKind.StringLiteralExpression))
                {
                    value = les.Token.ValueText;
                    return true;
                }
            }
        }

        return false;
    }

    private static bool TryFindStaticReadOnlyCollection(
        ClassDeclarationSyntax classDecl,
        string fieldName,
        out CollectionExpressionSyntax collection,
        out string? error)
    {
        collection = null!;
        error = null;
        foreach (var member in classDecl.Members)
        {
            if (member is not FieldDeclarationSyntax fds)
                continue;
            foreach (var variable in fds.Declaration.Variables)
            {
                if (variable.Identifier.Text != fieldName)
                    continue;
                if (variable.Initializer?.Value is CollectionExpressionSyntax c)
                {
                    collection = c;
                    return true;
                }
            }
        }

        error = $"Could not find static readonly collection initializer for '{fieldName}'.";
        return false;
    }

    private static bool TryParseWireFields(CollectionExpressionSyntax collection, out List<WireFieldModel> fields, out string? error)
    {
        fields = new List<WireFieldModel>();
        error = null;
        foreach (var element in collection.Elements)
        {
            if (element is not ExpressionElementSyntax ee)
            {
                error = "Fields collection contains a non-expression element.";
                return false;
            }

            if (ee.Expression is not ObjectCreationExpressionSyntax oce)
            {
                error = "Each Fields entry must be 'new WireField(...)'.";
                return false;
            }

            if (oce.ArgumentList is null)
            {
                error = "WireField creation is missing argument list.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "JsonName", out var jsonExpr) ||
                !TryGetStringLiteral(jsonExpr, out var jsonName))
            {
                error = "WireField missing JsonName string.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "Clr", out var clrExpr) ||
                !TryParseClrWireKind(clrExpr, out var clr))
            {
                error = $"WireField '{jsonName}' missing or invalid Clr.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "Nullable", out var nullExpr) ||
                !TryParseBool(nullExpr, out var nullable))
            {
                error = $"WireField '{jsonName}' missing Nullable.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "PropertyName", out var propExpr) ||
                !TryGetStringLiteral(propExpr, out var propertyName))
            {
                error = $"WireField '{jsonName}' missing PropertyName.";
                return false;
            }

            string? enumTypeName = null;
            if (TryGetNamedArg(oce.ArgumentList.Arguments, "EnumTypeName", out var enumExpr))
            {
                if (!TryGetStringLiteral(enumExpr, out enumTypeName))
                {
                    error = $"WireField '{jsonName}' has invalid EnumTypeName.";
                    return false;
                }
            }

            fields.Add(new WireFieldModel(jsonName, clr, nullable, propertyName, enumTypeName));
        }

        return true;
    }

    private static bool TryParseWireEnums(CollectionExpressionSyntax collection, out List<WireEnumModel> enums, out string? error)
    {
        enums = new List<WireEnumModel>();
        error = null;
        foreach (var element in collection.Elements)
        {
            if (element is not ExpressionElementSyntax ee || ee.Expression is not ObjectCreationExpressionSyntax oce)
            {
                error = "Each Enums entry must be 'new WireEnum(...)'.";
                return false;
            }

            if (oce.ArgumentList is null)
            {
                error = "WireEnum creation is missing argument list.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "Name", out var nameExpr) ||
                !TryGetStringLiteral(nameExpr, out var enumName))
            {
                error = "WireEnum missing Name.";
                return false;
            }

            if (!TryGetNamedArg(oce.ArgumentList.Arguments, "Members", out var membersExpr) ||
                membersExpr is not CollectionExpressionSyntax membersCollection)
            {
                error = $"WireEnum '{enumName}' missing Members collection.";
                return false;
            }

            var members = new List<WireEnumMemberModel>();
            foreach (var mEl in membersCollection.Elements)
            {
                if (mEl is not ExpressionElementSyntax mee || mee.Expression is not ObjectCreationExpressionSyntax mce)
                {
                    error = $"WireEnum '{enumName}' members must be 'new WireEnumMember(...)'.";
                    return false;
                }

                if (mce.ArgumentList is null)
                {
                    error = $"WireEnum '{enumName}' member is missing arguments.";
                    return false;
                }

                var args = mce.ArgumentList.Arguments;
                if (args.Count != 2 ||
                    args[0].Expression is not LiteralExpressionSyntax a0 || !a0.IsKind(SyntaxKind.StringLiteralExpression) ||
                    args[1].Expression is not LiteralExpressionSyntax a1 || !a1.IsKind(SyntaxKind.StringLiteralExpression))
                {
                    error = $"WireEnum '{enumName}' member must be two string literals.";
                    return false;
                }

                members.Add(new WireEnumMemberModel(a0.Token.ValueText, a1.Token.ValueText));
            }

            enums.Add(new WireEnumModel(enumName, members));
        }

        return true;
    }

    private static bool TryGetNamedArg(SeparatedSyntaxList<ArgumentSyntax> args, string name, out ExpressionSyntax expr)
    {
        foreach (var a in args)
        {
            if (a.NameColon is null)
                continue;
            if (string.Equals(a.NameColon.Name.Identifier.Text, name, StringComparison.Ordinal))
            {
                expr = a.Expression;
                return true;
            }
        }

        expr = null!;
        return false;
    }

    private static bool TryGetStringLiteral(ExpressionSyntax expr, out string value)
    {
        value = "";
        if (expr is LiteralExpressionSyntax les && les.IsKind(SyntaxKind.StringLiteralExpression))
        {
            value = les.Token.ValueText;
            return true;
        }

        return false;
    }

    private static bool TryParseBool(ExpressionSyntax expr, out bool value)
    {
        value = false;
        if (expr is LiteralExpressionSyntax les && les.IsKind(SyntaxKind.TrueLiteralExpression))
        {
            value = true;
            return true;
        }

        if (expr is LiteralExpressionSyntax les2 && les2.IsKind(SyntaxKind.FalseLiteralExpression))
        {
            value = false;
            return true;
        }

        return false;
    }

    private static bool TryParseClrWireKind(ExpressionSyntax expr, out ClrWireKindModel kind)
    {
        kind = ClrWireKindModel.String;
        if (expr is not MemberAccessExpressionSyntax ma)
            return false;
        if (ma.Expression is not IdentifierNameSyntax id || id.Identifier.Text != "ClrWireKind")
            return false;
        switch (ma.Name.Identifier.Text)
        {
            case nameof(ClrWireKindModel.String): kind = ClrWireKindModel.String; return true;
            case nameof(ClrWireKindModel.Int64): kind = ClrWireKindModel.Int64; return true;
            case nameof(ClrWireKindModel.Int32): kind = ClrWireKindModel.Int32; return true;
            case nameof(ClrWireKindModel.Double): kind = ClrWireKindModel.Double; return true;
            case nameof(ClrWireKindModel.Boolean): kind = ClrWireKindModel.Boolean; return true;
            case nameof(ClrWireKindModel.DateTimeOffset): kind = ClrWireKindModel.DateTimeOffset; return true;
            case nameof(ClrWireKindModel.Enum): kind = ClrWireKindModel.Enum; return true;
            default: return false;
        }
    }
}

internal sealed class ContractSpec
{
    public ContractSpec(
        string version,
        string versionPropertyName,
        IReadOnlyList<WireFieldModel> fields,
        IReadOnlyList<WireEnumModel> enums)
    {
        Version = version;
        VersionPropertyName = versionPropertyName;
        Fields = fields;
        Enums = enums;
    }

    public string Version { get; }
    public string VersionPropertyName { get; }
    public IReadOnlyList<WireFieldModel> Fields { get; }
    public IReadOnlyList<WireEnumModel> Enums { get; }
}

internal sealed class WireFieldModel
{
    public WireFieldModel(string jsonName, ClrWireKindModel clr, bool nullable, string propertyName, string? enumTypeName)
    {
        JsonName = jsonName;
        Clr = clr;
        Nullable = nullable;
        PropertyName = propertyName;
        EnumTypeName = enumTypeName;
    }

    public string JsonName { get; }
    public ClrWireKindModel Clr { get; }
    public bool Nullable { get; }
    public string PropertyName { get; }
    public string? EnumTypeName { get; }
}

internal enum ClrWireKindModel
{
    String,
    Int64,
    Int32,
    Double,
    Boolean,
    DateTimeOffset,
    Enum
}

internal sealed class WireEnumModel
{
    public WireEnumModel(string name, IReadOnlyList<WireEnumMemberModel> members)
    {
        Name = name;
        Members = members;
    }

    public string Name { get; }
    public IReadOnlyList<WireEnumMemberModel> Members { get; }
}

internal sealed class WireEnumMemberModel
{
    public WireEnumMemberModel(string clrName, string jsonWireName)
    {
        ClrName = clrName;
        JsonWireName = jsonWireName;
    }

    public string ClrName { get; }
    public string JsonWireName { get; }
}
