using System;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Text;

namespace ContractSourceGenerator;

[Generator]
public sealed class EventContractV1Generator : IIncrementalGenerator
{
    private static readonly DiagnosticDescriptor ParseError = new(
        id: "VNT7001",
        title: "Event contract spec parse error",
        messageFormat: "{0}",
        category: "Contract",
        defaultSeverity: DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var specs = context.AdditionalTextsProvider
            .Where(static t => t.Path.EndsWith("EventContractV1.cs", StringComparison.OrdinalIgnoreCase))
            .Select(static (t, ct) =>
            {
                var text = t.GetText(ct)?.ToString() ?? "";
                if (!ContractSpecParser.TryParse(text, out var spec, out var err))
                    return (Ok: false, Spec: (ContractSpec?)null, Message: err ?? "Unknown parse error.");
                return (Ok: true, Spec: spec, Message: (string?)null);
            });

        context.RegisterSourceOutput(specs, static (spc, input) =>
        {
            if (!input.Ok || input.Spec is null)
            {
                spc.ReportDiagnostic(Diagnostic.Create(ParseError, Location.None, input.Message ?? "Parse failed."));
                return;
            }

            var source = ContractEmitter.EmitAll(input.Spec);
            spc.AddSource("GeneratedContract.EventContractV1.g.cs", SourceText.From(source, Encoding.UTF8));
        });
    }
}
