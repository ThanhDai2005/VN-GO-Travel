using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using MauiApp1.Models.Entities;
using MauiApp1.Services;

namespace MauiApp1.ViewModels;

public sealed class DownloadManagerViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly IAudioDownloadService _audioDownload;
    private readonly INavigationService _nav;

    public ObservableCollection<DownloadedAudioItem> Items { get; } = new();

    private string _storageUsedText = "0 MB";
    public string StorageUsedText
    {
        get => _storageUsedText;
        private set { _storageUsedText = value; OnPropertyChanged(); }
    }

    public ICommand RefreshCommand { get; }
    public ICommand DeletePackageCommand { get; }
    public ICommand RedownloadCommand { get; }

    public DownloadManagerViewModel(AuthService auth, IAudioDownloadService audioDownload, INavigationService nav)
    {
        _auth = auth;
        _audioDownload = audioDownload;
        _nav = nav;

        RefreshCommand = new Command(async () => await LoadAsync());
        DeletePackageCommand = new Command<string>(async zone => await DeleteZoneAsync(zone));
        RedownloadCommand = new Command<string>(async zone => await RedownloadAsync(zone));
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public async Task EnsureAuthAndLoadAsync()
    {
        if (!_auth.IsAuthenticated)
        {
            await _nav.NavigateToAsync("//login").ConfigureAwait(false);
            return;
        }
        await LoadAsync().ConfigureAwait(false);
    }

    public async Task LoadAsync()
    {
        var all = await _audioDownload.GetAllDownloadedAudioAsync().ConfigureAwait(false);
        var grouped = all
            .GroupBy(x => $"{x.ZoneId.ToUpperInvariant()}|{x.Lang.ToLowerInvariant()}")
            .Select(g => new DownloadedAudioItem
            {
                ZoneCode = g.First().ZoneId,
                Language = g.First().Lang,
                ItemCount = g.Count(),
                SourceTypes = string.Join(",", g.Select(x => x.SourceType).Distinct(StringComparer.OrdinalIgnoreCase))
            })
            .OrderBy(x => x.ZoneCode)
            .ThenBy(x => x.Language)
            .ToList();

        var storage = await _audioDownload.GetStorageBytesAsync().ConfigureAwait(false);
        var storageMb = storage / (1024d * 1024d);
        StorageUsedText = $"{storageMb:F2} MB";

        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            Items.Clear();
            foreach (var item in grouped)
                Items.Add(item);
        });
    }

    private async Task DeleteZoneAsync(string? zoneCode)
    {
        if (string.IsNullOrWhiteSpace(zoneCode)) return;
        await _audioDownload.DeleteZonePackageAsync(zoneCode).ConfigureAwait(false);
        await LoadAsync().ConfigureAwait(false);
    }

    private async Task RedownloadAsync(string? zoneCode)
    {
        if (string.IsNullOrWhiteSpace(zoneCode)) return;
        await _audioDownload.DownloadZoneAudioAsync(zoneCode).ConfigureAwait(false);
        await LoadAsync().ConfigureAwait(false);
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

public sealed class DownloadedAudioItem
{
    public string ZoneCode { get; set; } = "";
    public string Language { get; set; } = "vi";
    public int ItemCount { get; set; }
    public string SourceTypes { get; set; } = "";
}
