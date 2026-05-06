using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class DownloadProgressPage : ContentPage
{
    private readonly IAudioDownloadService _audioDownloadService;
    public bool Skipped { get; private set; }

    public DownloadProgressPage(IAudioDownloadService audioDownloadService)
    {
        InitializeComponent();
        _audioDownloadService = audioDownloadService;
        _audioDownloadService.ProgressChanged += OnProgressChanged;
    }

    private void OnProgressChanged(object? sender, AudioDownloadProgressEventArgs e)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            ProgressBar.Progress = e.Progress;
            CounterLabel.Text = $"{e.CompletedPois}/{e.TotalPois}";
        });
    }

    private async void OnSkipClicked(object sender, EventArgs e)
    {
        Skipped = true;
        await Navigation.PopModalAsync();
    }

    protected override void OnDisappearing()
    {
        _audioDownloadService.ProgressChanged -= OnProgressChanged;
        base.OnDisappearing();
    }
}
