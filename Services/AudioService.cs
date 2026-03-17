using Microsoft.Maui.Media;

namespace MauiApp1.Services;

public class AudioService
{
    // Khai báo đèn giao thông (chỉ cho phép 1 luồng âm thanh chạy tại 1 thời điểm)
    private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);

    public async Task SpeakAsync(string text, string languageCode)
    {
        // Bắt đầu xếp hàng chờ tới lượt đọc
        await _semaphore.WaitAsync();

        try
        {
            // Lấy danh sách tất cả các giọng đọc trong điện thoại
            var locales = await TextToSpeech.Default.GetLocalesAsync();

            // Tự động tìm giọng đọc khớp với languageCode truyền vào (vd: "vi" hoặc "en")
            var selectedLocale = locales.FirstOrDefault(l =>
                l.Language.Equals(languageCode, StringComparison.OrdinalIgnoreCase));

            // Cấu hình tùy chọn đọc
            var options = new SpeechOptions()
            {
                Locale = selectedLocale, // Truyền đúng giọng vào đây
                Volume = 1.0f,
                Pitch = 1.0f
            };

            // Tiến hành đọc văn bản
            await TextToSpeech.Default.SpeakAsync(text, options);
        }
        catch (Exception ex)
        {
            // Bắt lỗi nếu máy người dùng không hỗ trợ TTS hoặc bị lỗi phần cứng
            Console.WriteLine($"Lỗi TTS: {ex.Message}");
        }
        finally
        {
            // Đọc xong thì nhả đèn xanh cho câu tiếp theo chạy
            _semaphore.Release();
        }
    }
}