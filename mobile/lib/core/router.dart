import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/auth_provider.dart';
import '../features/auth/login_screen.dart';
import '../features/home/home_shell.dart';
import '../features/worklist/customer_detail_screen.dart';
import '../features/field_visit/field_visit_screen.dart';
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
      GoRoute(path: '/home', builder: (ctx, s) => const HomeShell()),
      GoRoute(
        path: '/customer/:id',
        builder: (_, state) => CustomerDetailScreen(
          customerId: state.pathParameters['id']!,
        ),
        routes: [
          GoRoute(
            path: 'payment',
            builder: (_, state) => PaymentScreen(
              customerId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: 'ptps',
            builder: (_, state) => PtpsScreen(
              customerId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: 'field-visit',
            builder: (_, state) => FieldVisitScreen(
              customerId: state.pathParameters['id']!,
            ),
          ),
        ],
      ),
    ],
  );
});
