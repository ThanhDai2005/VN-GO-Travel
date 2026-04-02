using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class PoiDetailViewModel : INotifyPropertyChanged, IQueryAttributable
{
    private readonly PoiDatabase _db;
    private readonly AudioService _audioService;
    private readonly MapViewModel _mapVm;

    public PoiDetailViewModel(PoiDatabase db, AudioService audioService, MapViewModel mapVm)
    {
        _db = db;
        _audioService = audioService;
        _mapVm = mapVm;
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

            Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes code='{code}' lang='{lang}'");
            await LoadPoiAsync(code, lang);
            Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes done Poi null?={Poi == null}");
        }
    }

    public async Task LoadPoiAsync(string code, string? lang = null)
    {
        if (IsBusy) return;
        IsBusy = true;

        try
        {
            Debug.WriteLine($"[QR-NAV] PoiDetail LoadPoiAsync start code='{code}' lang='{lang}'");
            await _db.InitAsync();
            Poi = await _db.GetByCodeAsync(code, lang);
            Debug.WriteLine($"[QR-NAV] PoiDetail LoadPoiAsync end Poi null?={Poi == null}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] PoiDetail LoadPoiAsync: {ex}");
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

    public async Task OpenOnMapAsync()
    {
        if (Poi == null || string.IsNullOrWhiteSpace(Poi.Code))
        {
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync skipped: no Poi/code");
            return;
        }

        try
        {
            // Request map focus including the POI language so MapPage can load the correct POI
            _mapVm.RequestFocusOnPoiCode(Poi.Code, Poi.LanguageCode);
            Debug.WriteLine($"[QR-NAV] OpenOnMapAsync BEFORE GoToAsync //map code='{Poi.Code}' lang='{Poi.LanguageCode}' main={MainThread.IsMainThread}");
            await Shell.Current.GoToAsync("//map");
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync AFTER GoToAsync //map");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OpenOnMapAsync: {ex}");
        }
    }
}
