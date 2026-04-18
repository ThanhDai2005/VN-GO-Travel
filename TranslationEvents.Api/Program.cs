using System.Text.Json;
using System.Text.Json.Serialization;
using ContractObservability;
using ContractObservability.Replay;
using TranslationEvents.Api.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});
builder.Services.AddSingleton<EventValidationService>();
builder.Services.AddSingleton(sp => new ContractTelemetryTracker(sp.GetService<ILogger<ContractTelemetryTracker>>()));
builder.Services.AddSingleton<IContractTelemetryTracker>(sp => sp.GetRequiredService<ContractTelemetryTracker>());
#if DEBUG
builder.Services.AddSingleton<ContractEventJournal>();
builder.Services.AddSingleton<IContractReplayCapture>(sp => sp.GetRequiredService<ContractEventJournal>());
builder.Services.AddSingleton<ContractReplayDebugService>();
#else
builder.Services.AddSingleton<IContractReplayCapture, NoOpContractReplayCapture>();
#endif
builder.Services.AddHostedService<ContractTelemetryHostedService>();
var app = builder.Build();
app.MapControllers();
app.Run();
