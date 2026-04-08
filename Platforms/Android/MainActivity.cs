using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Util;
using MauiApp1.Services;

namespace MauiApp1
{
    [Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
    [IntentFilter(new[] { Intent.ActionView }, Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable }, DataScheme = "https", DataHost = "thuyetminh.netlify.app", DataPathPrefix = "/poi/")]
    [IntentFilter(new[] { Intent.ActionView }, Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable }, DataScheme = "https", DataHost = "thuyetminh.netlify.app", DataPathPrefix = "/p/")]
    public class MainActivity : MauiAppCompatActivity
    {
        const string Tag = "DLINK";

        protected override void OnCreate(Bundle? savedInstanceState)
        {
            base.OnCreate(savedInstanceState);
            Log.Debug(Tag, $"OnCreate Action={Intent?.Action}, Data={Intent?.DataString}");
            global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] OnCreate action={Intent?.Action} data={Intent?.DataString}");
            HandleIntent(Intent, "OnCreate");
        }

        protected override void OnNewIntent(Intent? intent)
        {
            base.OnNewIntent(intent);
            Log.Debug(Tag, $"OnNewIntent Action={intent?.Action}, Data={intent?.DataString}");
            global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] OnNewIntent action={intent?.Action} data={intent?.DataString}");

            if (intent != null)
            {
                // Android 15+ binding requires ComponentCaller; pass null when not available.
                SetIntent(intent, null);
                global::System.Diagnostics.Debug.WriteLine("[DL-ACT] SetIntent updated with new VIEW intent");
                Log.Debug(Tag, "SetIntent updated with new intent");
            }

            HandleIntent(intent, "OnNewIntent");
        }

        private void HandleIntent(Intent? intent, string source)
        {
            try
            {
                if (intent?.Action != Intent.ActionView)
                {
                    Log.Debug(Tag, $"{source} - Ignore non-VIEW intent");
                    global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} ignored: not ActionView");
                    return;
                }

                var raw = intent.DataString;
                Log.Debug(Tag, $"{source} - HandleIntent raw={raw}");
                if (string.IsNullOrWhiteSpace(raw))
                {
                    Log.Debug(Tag, $"{source} - VIEW intent but empty DataString");
                    global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} VIEW but empty DataString");
                    return;
                }

                var mauiApp = Application as MauiApplication;
                var services = mauiApp?.Services;
                if (services == null)
                {
                    Log.Warn(Tag, "MAUI services not available to store pending deep link");
                    global::System.Diagnostics.Debug.WriteLine("[DL-ERR] MAUI services null in HandleIntent");
                    return;
                }

                var pending = services.GetService(typeof(PendingDeepLinkStore)) as PendingDeepLinkStore;
                if (pending == null)
                {
                    Log.Warn(Tag, "PendingDeepLinkStore not registered");
                    global::System.Diagnostics.Debug.WriteLine("[DL-ERR] PendingDeepLinkStore not registered");
                    return;
                }

                var coordinator = services.GetService(typeof(DeepLinkCoordinator)) as DeepLinkCoordinator;

                var isWarm = source == "OnNewIntent";
                pending.SetPendingLink(raw, isWarm: isWarm);
                global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} queued uri={raw} isWarm={isWarm} (store updated)");
                Log.Debug(Tag, $"{source} - Stored pending deep link: {raw} (isWarm={isWarm})");

                coordinator?.OnAndroidViewIntent(raw, source, isWarm);
            }
            catch (Exception ex)
            {
                Log.Error(Tag, $"HandleIntent failed: {ex}");
                global::System.Diagnostics.Debug.WriteLine($"[DL-ERR] HandleIntent: {ex}");
            }
        }
    }
}
