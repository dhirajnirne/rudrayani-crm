// Phase 12: Team Leader dashboard widget test. Every network-backed provider
// the screen reads is overridden with fixed fake data (this project's stance
// on live-network unit tests, see call_log_screen_test.dart) so the test is
// fast and deterministic -- no server, no platform channels involved.
//
// Assertions target DashboardStatCard by its `label` rather than raw literal
// text: several cards legitimately show the same short numeric string (e.g.
// "3" as both a count and part of another figure), so matching by label is
// the only collision-free way to check a specific card's value. The test
// viewport is also enlarged so every section is actually mounted -- a plain
// ListView only builds children within its viewport + cache extent, and this
// dashboard has more sections than a default test surface's height.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/features/dashboard/dashboard_widgets.dart';
import 'package:rudrayani_mobile/features/dashboard/team_leader_dashboard_screen.dart';

void expectStat(WidgetTester tester, String label, String value) {
  final finder = find.byWidgetPredicate((w) => w is DashboardStatCard && w.label == label);
  expect(finder, findsOneWidget, reason: 'expected a DashboardStatCard labeled "$label"');
  expect(tester.widget<DashboardStatCard>(finder).value, value, reason: 'card "$label"');
}

void main() {
  final members = [
    {
      'user_id': 'agent-1',
      'full_name': 'Asha Field',
      'is_field_agent': true,
      'is_telecaller': false,
      'team_name': 'Team A',
      'first_in': '2026-07-11T03:30:00.000Z',
      'last_out': null,
      'on_duty': true,
      'minutes_worked': 120,
      'calls': 5,
      'ptps': 2,
      'payments_count': 3,
      'payments_total': 15000,
      'cash_total': 9000,
      'online_total': 6000,
      'field_visits': 4,
      'field_visits_with_photo': 3,
      'field_visits_with_signature': 2,
    },
    {
      'user_id': 'agent-2',
      'full_name': 'Bala Tele',
      'is_field_agent': false,
      'is_telecaller': true,
      'team_name': 'Team A',
      'first_in': null,
      'last_out': null,
      'on_duty': false,
      'minutes_worked': 0,
      'calls': 0,
      'ptps': 0,
      'payments_count': 0,
      'payments_total': 0,
      'cash_total': 0,
      'online_total': 0,
      'field_visits': 0,
      'field_visits_with_photo': 0,
      'field_visits_with_signature': 0,
    },
  ];

  final dayPlanAgents = [
    {
      'user_id': 'agent-1',
      'full_name': 'Asha Field',
      'ptps_due': {'count': 2, 'total_amount': 10000},
    },
    {
      'user_id': 'agent-2',
      'full_name': 'Bala Tele',
      'ptps_due': {'count': 1, 'total_amount': 5000},
    },
  ];

  final trail = {
    'ptps_created': 5,
    'ptps_kept': 3,
    'ptps_broken': 1,
    'ptps_pending': 1,
    'ptps_pending_value': 4000,
    'ptp_conversion_pct': 75.0,
    'escalated_count': 0,
  };

  Future<void> pumpScreen(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 5000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tlTeamDayProvider.overrideWith((ref) async => members),
          tlDayPlanProvider.overrideWith((ref) async => dayPlanAgents),
          tlTrailProvider.overrideWith((ref) async => trail),
        ],
        child: const MaterialApp(home: TeamLeaderDashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders team attendance, collections, and PTP summary', (tester) async {
    await pumpScreen(tester);

    // Each member's name appears twice: once in the attendance row, once in
    // the Route Map section below it.
    expect(find.text('Asha Field'), findsNWidgets(2));
    expect(find.text('Bala Tele'), findsNWidgets(2));

    // Attendance: 1 of 2 on duty, 1 punched in.
    expectStat(tester, 'On Duty', '1 / 2');
    expectStat(tester, 'Punched In', '1');

    // Cash/Online collections summed across members (9000 cash, 6000 online).
    expectStat(tester, 'Cash', '₹ 0.09L');
    expectStat(tester, 'Online', '₹ 0.06L');

    // Receipts summed across members: 4 visits, 3 with photo, 2 with signature.
    expectStat(tester, 'Receipts Generated', '4');
    expectStat(tester, 'With Photo', '3');
    expectStat(tester, 'With Signature', '2');

    // Follow-ups due today: 2 + 1 = 3 across the team, 15,000 promised.
    expectStat(tester, 'Due Today', '3');
    expectStat(tester, 'Promised Amount', '₹ 0.15L');

    // PTP created/kept/broken/conversion.
    expectStat(tester, 'Created', '5');
    expectStat(tester, 'Kept', '3');
    expectStat(tester, 'Broken', '1');
    expectStat(tester, 'Conversion', '75.0%');
  });

  testWidgets('shows an empty state when the team has no members', (tester) async {
    tester.view.physicalSize = const Size(1080, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tlTeamDayProvider.overrideWith((ref) async => <Map<String, dynamic>>[]),
          tlDayPlanProvider.overrideWith((ref) async => <Map<String, dynamic>>[]),
          tlTrailProvider.overrideWith((ref) async => trail),
        ],
        child: const MaterialApp(home: TeamLeaderDashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No team members found'), findsOneWidget);
  });
}
