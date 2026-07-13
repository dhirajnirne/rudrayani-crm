import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/auth_provider.dart';
import '../features/auth/login_screen.dart';
import '../features/home/home_shell.dart';
import '../features/worklist/customer_detail_screen.dart';
import '../features/field_visit/field_visit_screen.dart';
import '../features/payment/payment_screen.dart';
import '../features/payment/payment_history_screen.dart';
import '../features/ptps/ptps_screen.dart';
import '../features/ptps/all_ptps_screen.dart';
import '../features/reminders/reminders_screen.dart';
import '../features/worklist/correction_requests_screen.dart';
import '../features/management/company_view_screen.dart';
import '../features/management/live_tracking_screen.dart';
import '../features/management/attendance_overview_screen.dart';
import '../features/management/org_reference_screen.dart';
import '../features/management/org_chart_screen.dart';
import '../features/management/employees_screen.dart';
import '../features/management/import_status_screen.dart';
import '../features/management/placeholder_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: authState.isLoggedIn ? '/home' : '/login',
    redirect: (_, state) {
      final loggedIn = authState.isLoggedIn;
      final onLogin = state.matchedLocation == '/login';
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn && onLogin) return '/home';

      // Strict permission-based view checks for management routes
      if (state.matchedLocation.startsWith('/management')) {
        final caps = authState.capabilities;
        final isManagement = caps.contains('agency_admin') || caps.contains('operations_manager');
        if (!isManagement) return '/home';

        // Additional checks for agency-admin-only screens
        final isAgencyAdminOnly = state.matchedLocation.contains('org-chart') ||
            state.matchedLocation.contains('employees') ||
            state.matchedLocation.contains('import-status') ||
            state.matchedLocation.contains('field-config') ||
            state.matchedLocation.contains('alerts');

        if (isAgencyAdminOnly && !caps.contains('agency_admin')) {
          return '/home';
        }
      }

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
      GoRoute(path: '/more/ptps', builder: (_, __) => const AllPtpsScreen()),
      GoRoute(path: '/more/payment-history', builder: (_, __) => const PaymentHistoryScreen()),
      GoRoute(path: '/more/reminders', builder: (_, __) => const RemindersScreen()),
      GoRoute(path: '/more/correction-request', builder: (_, __) => const CorrectionRequestsScreen()),
      GoRoute(path: '/management/company-view', builder: (_, __) => const CompanyViewScreen()),
      GoRoute(path: '/management/live-tracking', builder: (_, __) => const LiveTrackingScreen()),
      GoRoute(path: '/management/reports', builder: (_, __) => const PlaceholderScreen(title: 'Reports')),
      GoRoute(path: '/management/attendance', builder: (_, __) => const AttendanceOverviewScreen()),
      GoRoute(path: '/management/org-reference', builder: (_, __) => const OrgReferenceScreen()),
      GoRoute(path: '/management/org-chart', builder: (_, __) => const OrgChartScreen()),
      GoRoute(path: '/management/employees', builder: (_, __) => const EmployeesScreen()),
      GoRoute(path: '/management/import-status', builder: (_, __) => const ImportStatusScreen()),
      GoRoute(path: '/management/field-config', builder: (_, __) => const PlaceholderScreen(title: 'Field Config')),
      GoRoute(path: '/management/alerts', builder: (_, __) => const PlaceholderScreen(title: 'Alerts')),
    ],
  );
});
