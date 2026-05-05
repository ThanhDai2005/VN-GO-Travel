namespace MauiApp1.Services.Visuals;

public static class DensityColorMapper
{
    /// <summary>
    /// Maps normalized intensity (0.0 to 1.0) to the production green scale.
    /// 0.0 -> White (#FFFFFF)
    /// 0.25 -> Light Green (#C8F7C5)
    /// 0.5 -> Green (#7ED957)
    /// 0.75 -> Active Green (#2ECC71)
    /// 1.0 -> Dark Green (#006400)
    /// </summary>
    public static Color GetColor(double intensity)
    {
        if (double.IsNaN(intensity) || double.IsInfinity(intensity)) 
            intensity = 0.0;

        intensity = Math.Clamp(intensity, 0.0, 1.0);

        if (intensity <= 0.25)
            return Lerp(Colors.White, Color.FromArgb("#C8F7C5"), intensity / 0.25);
        
        if (intensity <= 0.5)
            return Lerp(Color.FromArgb("#C8F7C5"), Color.FromArgb("#7ED957"), (intensity - 0.25) / 0.25);
        
        if (intensity <= 0.75)
            return Lerp(Color.FromArgb("#7ED957"), Color.FromArgb("#2ECC71"), (intensity - 0.5) / 0.25);
        
        return Lerp(Color.FromArgb("#2ECC71"), Color.FromArgb("#006400"), (intensity - 0.75) / 0.25);
    }

    public static string GetLabel(double intensity)
    {
        if (intensity <= 0.1) return "Quiet";
        if (intensity <= 0.4) return "Low";
        if (intensity <= 0.7) return "Active";
        return "Busy";
    }

    private static Color Lerp(Color start, Color end, double amount)
    {
        float r = (float)(start.Red + (end.Red - start.Red) * amount);
        float g = (float)(start.Green + (end.Green - start.Green) * amount);
        float b = (float)(start.Blue + (end.Blue - start.Blue) * amount);
        float a = (float)(start.Alpha + (end.Alpha - start.Alpha) * amount);
        return new Color(r, g, b, a);
    }
}
