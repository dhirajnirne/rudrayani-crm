import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api/api_client.dart';
import 'core/auth/auth_provider.dart';
import 'core/notifications/notification_service.dart';
import 'core/router.dart';
import 'core/tracking/tracking_service.dart';
import 'features/reminders/reminders_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Must happen before any Dio is built (buildDio() reads effectiveBaseUrl
  // synchronously) — otherwise the first requests race the storage read.
  await loadServerUrlOverride();
  await NotificationService.init();
  // Port for UI <-> tracking-service isolate communication (must be set up
  // before runApp per flutter_foreground_task docs).
  TrackingService.initCommunicationPort();
  runApp(const ProviderScope(child: RudrayaniApp()));
}

class RudrayaniApp extends ConsumerStatefulWidget {
  const RudrayaniApp({super.key});

  @override
  ConsumerState<RudrayaniApp> createState() => _RudrayaniAppState();
}

class _RudrayaniAppState extends ConsumerState<RudrayaniApp> {
  @override
  void initState() {
    super.initState();
    // Restore session on startup
    Future.microtask(() => ref.read(authProvider.notifier).init());
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    // Covers both session restore (init(), above) and a fresh login: either
    // way, once the app has a session, make sure the device's scheduled
    // reminder notifications match the server's current pending list — a
    // fresh install or a device reboot both start with none scheduled.
    ref.listen(authProvider, (prev, next) {
      if (next.isLoggedIn && prev?.isLoggedIn != true) {
        NotificationService.requestPermission();
        rescheduleAllReminders(ref);
      }
    });

    return MaterialApp.router(
      title: 'Rudrayani CRM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF00535B),
          primary: const Color(0xFF00535B),
        ),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      routerConfig: router,
    );
  }
}
