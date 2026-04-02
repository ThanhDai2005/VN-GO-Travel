QR package inspection tools

Purpose

This folder contains a PowerShell inspection script that collects information about the locally restored ZXing.Net.MAUI package and the project's transitive dependencies.
Use this in the experimental branch to verify the exact control types, events, extension methods, and package nuspec before adding camera UI.

How to run

1. Open PowerShell (PowerShell 7 recommended) in repository root.
2. Run:

   pwsh ./tools/qr-package-inspection/inspect.ps1

   or from Windows PowerShell:

   .\tools\qr-package-inspection\inspect.ps1

Notes

- The script will create an output directory at `tools/qr-package-inspection/output/` and write a set of files described below.
- The script will run `dotnet restore`, list transitive packages, locate the ZXing package under your global NuGet packages folder, inspect the DLL via reflection, and run `dotnet build` (general) and an Android build. The Android build may take a while.
- If the ZXing package is not present in your global packages folder, the script will report that and exit early; ensure you have restored packages before running.

Files generated (you should paste back the minimal set listed below):

- transitive.txt
- zxing_files.txt
- zxing_types.txt
- zxing_candidate_types.txt
- zxing_extension_methods.txt
- type_summary.txt (per-candidate type summary)
- type_events.txt
- type_props.txt
- likely_event_type.txt
- event_type_props.txt
- zxing_nuspec.txt
- build_restore_output.txt
- build_output.txt
- build_android_output.txt

Minimum files to paste back to continue Phase 2 verification

Please paste the following files (or their relevant excerpts) after running the script:

- transitive.txt
- zxing_candidate_types.txt
- zxing_extension_methods.txt
- type_events.txt
- type_props.txt
- zxing_nuspec.txt
- build_android_output.txt

Security

- The script only reads local NuGet package files and runs `dotnet` commands. It does not modify source code.

Troubleshooting

- If the script cannot locate your global NuGet packages folder, it will default to `%USERPROFILE%\.nuget\packages`.
- If the Android build fails, copy `build_android_output.txt` and paste it here for analysis.

Contact

After running, paste the requested output files back into the chat and I will analyze them and prepare Phase 3 instructions.
