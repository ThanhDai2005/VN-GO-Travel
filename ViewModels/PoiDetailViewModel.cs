using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class PoiDetailViewModel : INotifyPropertyChanged, IQueryAttributable
{
    private readonly PoiDatabase _db;
    private readonly AudioService _audioService;

    public PoiDetailViewModel(PoiDatabase db, AudioService audioService)
    {
        _db = db;
        _audioService = audioService;
    }

    private Poi? _poi;
    public Poi? Poi
    {
        get => _poi;
        set { _poi = value; OnPropertyChanged(); }
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set { _isBusy = value; OnPropertyChanged(); }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    public async void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("code", out var cobj) && cobj is string code)
        {
            string? lang = null;
            if (query.TryGetValue("lang", out var lobj) && lobj is string lstr)
                lang = lstr;

            await LoadPoiAsync(code, lang);
        }
    }

    public async Task LoadPoiAsync(string code, string? lang = null)
    {
        if (IsBusy) return;
        IsBusy = true;

        try
        {
            await _db.InitAsync();
            Poi = await _db.GetByCodeAsync(code, lang);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task PlayAsync()
    {
        if (Poi == null) return;

        var text = !string.IsNullOrWhiteSpace(Poi.NarrationLong)
            ? Poi.NarrationLong
            : (!string.IsNullOrWhiteSpace(Poi.NarrationShort) ? Poi.NarrationShort : Poi.Name);

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text, Poi.LanguageCode);
    }

    public void Stop()
    {
        _audioService.Stop();
    }
}
