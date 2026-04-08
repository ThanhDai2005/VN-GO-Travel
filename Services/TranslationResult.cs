namespace MauiApp1.Services;

/// <summary>Outcome of a single translation attempt. When <see cref="Succeeded"/> is false, <see cref="Text"/> is the original input and must not be written to SQLite cache.</summary>
public readonly record struct TranslationResult(string Text, bool Succeeded);
