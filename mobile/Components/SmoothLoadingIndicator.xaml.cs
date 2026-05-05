using Microsoft.Maui.Controls;
using System;
using System.Threading.Tasks;

namespace VNGOTravel.Components
{
    /// <summary>
    /// Smooth Loading Indicator for Demo Mode
    /// Provides visual feedback during operations
    /// </summary>
    public partial class SmoothLoadingIndicator : ContentView
    {
        private bool _isVisible;

        public SmoothLoadingIndicator()
        {
            InitializeComponent();
            IsVisible = false;
        }

        public static readonly BindableProperty MessageProperty =
            BindableProperty.Create(nameof(Message), typeof(string), typeof(SmoothLoadingIndicator), "Loading...");

        public string Message
        {
            get => (string)GetValue(MessageProperty);
            set => SetValue(MessageProperty, value);
        }

        /// <summary>
        /// Show loading with smooth fade-in animation
        /// </summary>
        public async Task ShowAsync(string message = "Loading...")
        {
            if (_isVisible) return;

            Message = message;
            _isVisible = true;
            IsVisible = true;
            Opacity = 0;

            await this.FadeToAsync(1, 200, Easing.CubicOut).ConfigureAwait(false);
        }

        /// <summary>
        /// Hide loading with smooth fade-out animation
        /// </summary>
        public async Task HideAsync()
        {
            if (!_isVisible) return;

            await this.FadeToAsync(0, 200, Easing.CubicIn).ConfigureAwait(false);
            IsVisible = false;
            _isVisible = false;
        }

        /// <summary>
        /// Show loading for a specific operation with auto-hide
        /// </summary>
        public async Task<T> WrapOperationAsync<T>(Func<Task<T>> operation, string message = "Loading...")
        {
            try
            {
                await ShowAsync(message);
                return await operation();
            }
            finally
            {
                await HideAsync();
            }
        }

        /// <summary>
        /// Show loading for a specific operation (void) with auto-hide
        /// </summary>
        public async Task WrapOperationAsync(Func<Task> operation, string message = "Loading...")
        {
            try
            {
                await ShowAsync(message);
                await operation();
            }
            finally
            {
                await HideAsync();
            }
        }
    }
}
