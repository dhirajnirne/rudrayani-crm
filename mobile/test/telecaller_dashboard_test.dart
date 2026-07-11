// Phase 12: Telecaller dashboard widget test. Exercises the RPC/Connected
// Calls derivation (total_trails minus NC/OSER result codes) with concrete
// numbers, plus collection today/MTD and the target-vs-achievement card.
// Every network-backed provider is overridden with fixed fake data.
//
// Assertions target DashboardStatCard by its `label` (see
// team_leader_dashboard_test.dart for why: several cards can legitimately
// show the same literal number). The test viewport is enlarged so every
// section is mounted without needing to simulate scrolling.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/features/dashboard/dashboard_widgets.dart';
import 'package:rudrayani_mobile/features/dashboard/telecaller_dashboard_screen.dart';

void expectStat(WidgetTester tester, String label, String value) {
  final finder = find.byWidgetPredicate((w) => w is DashboardStatCard && w.label == label);
  expect(finder, findsOneWidget, reason: 'expected a DashboardStatCard labeled "$label"');
  expect(tester.widget<DashboardStatCard>(finder).value, value, reason: 'card "$label"');
}

void main() {
  final dashboard = {
    'collection': {
      'mtd_amount': 250000,
      'today_amount': 20000,
      'target_amount': 500000,
      'target_pct': 50.0,
    },
  };

  final trail = {
    'total_trails': 10,
    'unique_customers_contacted': 8,
    'by_action_code': <Map<String, dynamic>>[],
    'by_result_code': [
      {'result_code': 'PTP', 'count': 4},
      {'result_code': 'NC', 'count': 3}, // not connected
      {'result_code': 'OSER', 'count': 1}, // not connected
      {'result_code': 'RTP', 'count': 2},
    ],
    'ptps_created': 6,
    'ptps_kept': 4,
    'ptps_broken': 1,
    'ptps_pending': 1,
    'ptps_pending_value': 12000,
    'ptp_conversion_pct': 80.0,
    'escalated_count': 2,
  };

  Future<void> pumpScreen(WidgetTester tester, {Map<String, dynamic>? trailOverride}) async {
    tester.view.physicalSize = const Size(1080, 5000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          teleDashboardProvider.overrideWith((ref) async => dashboard),
          teleTrailProvider.overrideWith((ref) async => trailOverride ?? trail),
        ],
        child: const MaterialApp(home: TelecallerDashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders collection, target progress, calls, and PTP summary', (tester) async {
    await pumpScreen(tester);

    // Collection today/MTD.
    expectStat(tester, 'Today', '₹ 0.20L');
    expectStat(tester, 'MTD', '₹ 2.50L');
    expect(find.textContaining('of ₹ 5.00L target'), findsOneWidget);

    // RPC/Connected Calls = 10 total - (3 NC + 1 OSER) = 6.
    expectStat(tester, 'Total Calls', '10');
    expectStat(tester, 'RPC / Connected', '6');
    expectStat(tester, 'Escalation Cases', '2');

    // PTP created/kept/broken/pending value.
    expectStat(tester, 'Created', '6');
    expectStat(tester, 'Kept', '4');
    expectStat(tester, 'Broken', '1');
    expectStat(tester, 'Pending Value', '₹ 0.12L');
  });

  testWidgets('a fully-connected day (no NC/OSER) shows RPC equal to total calls', (tester) async {
    await pumpScreen(tester, trailOverride: {
      ...trail,
      'total_trails': 5,
      'by_result_code': [
        {'result_code': 'PTP', 'count': 5},
      ],
    });

    expectStat(tester, 'Total Calls', '5');
    expectStat(tester, 'RPC / Connected', '5');
  });
}
