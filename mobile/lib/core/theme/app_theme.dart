import 'package:flutter/material.dart';

/// Brand design tokens for the Rudrayani CRM mobile app.
/// Single source of truth for colour, spacing, and shape — wire into
/// ThemeData so every widget that uses theme properties gets them for free,
/// while widgets that need raw values import this file directly.
///
/// Palette: "Deep Trust Teal" (approved 2026-07-12, mobile redesign phase 1)
/// — mobile now intentionally diverges from frontend/src/theme/tokens.ts
/// (this pass is mobile-only; web keeps its existing tokens). Mobile is
/// still deliberately single-theme (no dark mode) — field agents work
/// outdoors in direct sunlight, where a dark theme hurts readability more
/// than it helps eye strain.
abstract class AppColors {
  // Brand teal scale
  static const primary = Color(0xFF0B5D63);
  static const primaryDark = Color(0xFF123A38);
  static const primarySurface = Color(0xFFE3EFEE);

  // App scaffold background — the mockup keeps a soft off-white surface
  // (not pure white) behind every screen, not just cards.
  static const background = Color(0xFFF3F6F5);

  // Status / semantic
  static const success = Color(0xFF2C694E);
  static const error = Color(0xFFBA1A1A);
  static const warning = Color(0xFFD77A00);
  static const info = Color(0xFF2563EB); // Informational banners/callouts
  static const successContainer = Color(0xFFE6F1EA);
  static const warningContainer = Color(0xFFFDF0DE);
  static const errorContainer = Color(0xFFFBE4E4);
  static const neutralContainer = Color(0xFFEDF1F0);

  // Darker on-container variants — used where semantic-colored text/icons
  // sit directly on a *Container background and need extra contrast (status
  // chips, banner copy) rather than the base semantic color.
  static const successStrong = Color(0xFF1E4D38);
  static const warningStrong = Color(0xFF9A5A00);
  static const errorStrong = Color(0xFF8C1414);

  // Rare fourth categorical color — timeline/legend entries only (e.g. PTP
  // markers), never a primary action color.
  static const accent = Color(0xFF7C3AED);

  // Neutral
  static const onPrimary = Colors.white;
  static const textSecondary = Color(0xFF64748B);
  static const textTertiary = Color(0xFF94A3B8);
  static const border = Color(0xFFDCE3E1);
}

abstract class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
}

abstract class AppRadius {
  static const sm = 6.0;
  static const md = 8.0;
  static const lg = 10.0;
  static const xl = 12.0;
  static const full = 100.0;
}

/// Field-conditions minimums from the design brief — strict, not aspirational.
abstract class AppDimens {
  /// Minimum tap target: buttons, chips, segmented tabs, icon buttons.
  static const tapTarget = 48.0;
  /// Minimum row height for mobile lists/form items (anti-misclick for
  /// field officers working on budget Android devices).
  static const listRow = 56.0;
}

/// MANDATORY (design brief: "font-variant-numeric: tabular-nums") for every
/// balance / due-amount / POS / EMI / payment figure so digits align in a
/// fixed-width column — matters for glare/sunlight readability in the field.
/// Usage: `Text(value, style: AppTextStyles.tabularNums)` or, to layer onto
/// an existing style, `someStyle.tabular`.
abstract class AppTextStyles {
  static const tabularNums = TextStyle(
    fontFeatures: [FontFeature.tabularFigures()],
  );
}

extension TabularNumsStyle on TextStyle {
  /// Merges tabular-figure alignment onto this style without discarding its
  /// other properties (size, weight, color, …).
  TextStyle get tabular =>
      merge(const TextStyle(fontFeatures: [FontFeature.tabularFigures()]));
}

ThemeData buildAppTheme() {
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      secondary: AppColors.success,
      error: AppColors.error,
    ),
    useMaterial3: true,
    fontFamily: 'Inter',
    scaffoldBackgroundColor: AppColors.background,
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.primary,
      foregroundColor: AppColors.onPrimary,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      elevation: 1,
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorColor: AppColors.primary.withValues(alpha: 0.15),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
    ),
  );
}
