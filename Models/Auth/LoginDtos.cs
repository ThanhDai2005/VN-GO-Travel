using System.Text.Json.Serialization;

namespace MauiApp1.Models.Auth;

public sealed class LoginRequestDto
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = "";

    [JsonPropertyName("password")]
    public string Password { get; set; } = "";
}

public sealed class RegisterRequestDto
{
    [JsonPropertyName("fullName")]
    public string? FullName { get; set; }

    [JsonPropertyName("email")]
    public string Email { get; set; } = "";

    [JsonPropertyName("password")]
    public string Password { get; set; } = "";
}

/// <summary>Shape returned by <c>POST /auth/login</c> inside <c>data</c>.</summary>
public sealed class LoginResponseDto
{
    [JsonPropertyName("user")]
    public UserDto? User { get; set; }

    [JsonPropertyName("token")]
    public string? Token { get; set; }
}

/// <summary>Backend wraps payloads as <c>{ "success": true, "data": { ... } }</c>.</summary>
public sealed class LoginApiEnvelope
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public LoginResponseDto? Data { get; set; }
}

/// <summary>Response envelope for GET /auth/me</summary>
public sealed class MeApiEnvelope
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public UserDto? Data { get; set; }
}

public sealed class UserDto
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("fullName")]
    public string? FullName { get; set; }

    [JsonPropertyName("role")]
    public string? Role { get; set; }

    [JsonPropertyName("qrScanCount")]
    public int QrScanCount { get; set; }

    [JsonPropertyName("purchasedZones")]
    public List<string> PurchasedZones { get; set; } = new();

    [JsonPropertyName("walletBalance")]
    public decimal WalletBalance { get; set; }
}
