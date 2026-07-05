import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/auth/auth_provider.dart';
import 'core/router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
