using MauiApp1.Models;

namespace MauiApp1.Messages;

/// <summary>
/// Message published when a background translation request is completed.
/// </summary>
/// <param name="Code">The POI code.</param>
/// <param name="Language">The target language.</param>
/// <param name="Result">The hydrated POI with the translation result.</param>
public record TranslationCompletedMessage(string Code, string Language, Poi Result);

/// <summary>
/// Message published when a background translation starts.
/// </summary>
public record TranslationStartedMessage(string Code, string Language);

/// <summary>
/// Message published when a background translation fails.
/// </summary>
public record TranslationFailedMessage(string Code, string Language, string Error);
