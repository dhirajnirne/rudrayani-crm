import 'package:flutter/material.dart';

/// Brand design tokens for the Rudrayani CRM mobile app.
/// Single source of truth for colour, spacing, and shape — wire into
/// ThemeData so every widget that uses theme properties gets them for free,
/// while widgets that need raw values import this file directly.
abstract class AppColors {
  // Brand teal scale
  static const primary = Color(0xFF00535B);
  static const primaryDark = Color(0xFF00423F);
  static const primarySurface = Color(0xFFE8ECEA);

  // Status / semantic
  static const success = Color(0xFF35D431);
  static const error = Color(0xFFBA1A1A);
  static const warning = Color(0xFFF57C00);
  static const warningContainer = Color(0xFFFFF7E6);
  static const errorContainer = Color(0xFFFDECEA);

  // Neutral
  static const onPrimary = Colors.white;
  static const textSecondary = Color(0xFF555555);
  static const textTertiary = Color(0xFF888888);
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
    ),
    useMaterial3: true,
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
  );
}
