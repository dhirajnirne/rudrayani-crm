import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/auth_provider.dart';
import '../core/models/customer.dart';
import '../features/auth/login_screen.dart';
import '../features/worklist/worklist_screen.dart';
import '../features/worklist/customer_detail_screen.dart';
import '../features/call_log/call_log_screen.dart';
import '../features/payment/payment_screen.dart';
import '../features/ptps/ptps_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: authState.isLoggedIn ? '/home' : '/login',
    redirect: (_, state) {
      final loggedIn = authState.isLoggedIn;
      final onLogin = state.matchedLocation == '/login';
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (ctx, s) => const LoginScreen()),
      GoRoute(path: '/home', builder: (ctx, s) => const WorklistScreen()),
      GoRoute(
        path: '/customer/:id',
        builder: (_, state) {
          final customer = state.extra as Customer;
          return CustomerDetailScreen(customer: customer);
        },
      ),
      GoRoute(
        path: '/call-log',
        builder: (_, state) {
          final customer = state.extra as Customer;
          return CallLogScreen(customer: customer);
        },
      ),
      GoRoute(
        path: '/payment',
        builder: (_, state) {
          final customer = state.extra as Customer;
          return PaymentScreen(customer: customer);
        },
      ),
      GoRoute(
        path: '/ptps',
        builder: (_, state) {
          final customer = state.extra as Customer;
          return PtpsScreen(customer: customer);
        },
      ),
    ],
  );
});
