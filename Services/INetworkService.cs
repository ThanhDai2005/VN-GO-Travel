using Microsoft.Maui.Networking;

namespace MauiApp1.Services;

public interface INetworkService
{
    bool IsConnected { get; }
    NetworkAccess NetworkAccess { get; }
}

public class NetworkService : INetworkService
{
    public bool IsConnected => Connectivity.Current.NetworkAccess == NetworkAccess.Internet;
    public NetworkAccess NetworkAccess => Connectivity.Current.NetworkAccess;
}
