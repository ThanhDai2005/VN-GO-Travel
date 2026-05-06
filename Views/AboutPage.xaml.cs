using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class AboutPage : ContentPage
{
    private readonly IAudioPlayerService _audioService;

    public AboutPage(IAudioPlayerService audioService)
    {
        InitializeComponent();
        _audioService = audioService;
    }

    private async void OnPlayIntroClicked(object sender, EventArgs e)
    {
        var text = "Việt Nam là đất nước của núi non hùng vĩ, những kỳ quan thiên nhiên nổi tiếng, các phố cổ đậm chiều sâu văn hóa và những vùng đất mang bản sắc riêng ở từng miền. Chào mừng bạn đến với VN GO Travel, nơi hành trình khám phá Việt Nam bắt đầu bằng cảm hứng, hình ảnh và âm thanh.";

        await _audioService.SpeakAsync("intro", text, "vi");
    }

    private async void OnStopIntroClicked(object sender, EventArgs e)
    {
        await _audioService.StopAsync();
    }
}