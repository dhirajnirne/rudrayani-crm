import 'package:flutter/material.dart';

/// Brand design tokens for the Rudrayani CRM mobile app.
/// Single source of truth for colour, spacing, and shape — wire into
/// ThemeData so every widget that uses theme properties gets them for free,
/// while widgets that need raw values import this file directly.
///
/// Palette: "Navy & Emerald" (approved 2026-07-10), mirrors
/// frontend/src/theme/tokens.ts so both clients repaint from the same
/// values. Mobile is deliberately single-theme (no dark mode) — field
/// agents work outdoors in direct sunlight, where a dark theme hurts
/// readability more than it helps eye strain.
abstract class AppColors {
  // Brand navy scale
  static const primary = Color(0xFF1E3A5F);
  static const primaryDark = Color(0xFF0F172A);
  static const primarySurface = Color(0xFFE9EEF5);

  // Status / semantic
  static const success = Color(0xFF059669); // Emerald
  static const error = Color(0xFFDC2626);
  static const warning = Color(0xFFD97706);
  static const successContainer = Color(0xFFE3F5EE);
  static const warningContainer = Color(0xFFFEF3E2);
  static const errorContainer = Color(0xFFFEE2E2);
  static const neutralContainer = Color(0xFFF1F3F4);

  // Neutral
  static const onPrimary = Colors.white;
  static const textSecondary = Color(0xFF64748B);
  static const textTertiary = Color(0xFF94A3B8);
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
