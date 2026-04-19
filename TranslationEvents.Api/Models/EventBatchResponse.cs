namespace TranslationEvents.Api.Models;

public sealed class EventBatchResponse
{
    public int Received { get; set; }
    public int Accepted { get; set; }
    public int Rejected { get; set; }
}
