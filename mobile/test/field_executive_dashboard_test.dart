// Phase 12: Field Executive dashboard widget test. Covers attendance/route
// rendering, target-vs-achievement, PTP summary, and -- importantly -- the
// two documented-gap cards (Visits Planned / Customer Location) that the
// Phase 12 brief explicitly says to surface rather than guess at.
//
// Assertions target DashboardStatCard by its `label` (see
// team_leader_dashboard_test.dart for why). The test viewport is enlarged so
// every section -- including the gap cards near the bottom -- is actually
// mounted; a plain ListView only builds children within its viewport + cache
// extent.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/features/dashboard/dashboard_widgets.dart';
import 'package:rudrayani_mobile/features/dashboard/field_executive_dashboard_screen.dart';

void expectStat(WidgetTester tester, String label, String value) {
  final finder = find.byWidgetPredicate((w) => w is DashboardStatCard && w.label == label);
  expect(finder, findsOneWidget, reason: 'expected a DashboardStatCard labeled "$label"');
  expect(tester.widget<DashboardStatCard>(finder).value, value, reason: 'card "$label"');
}

void main() {
  final attendance = {
    'user_id': 'agent-1',
    'full_name': 'Chandu Field',
    'on_duty': true,
    'first_in': '2026-07-11T03:00:00.000Z',
    'last_out': null,
    'minutes_worked': 180,
    'field_visits': 6,
    'field_visits_with_photo': 5,
    'field_visits_with_signature': 4,
  };

  final route = {
    'distance_meters': 4200,
    'points': List.generate(12, (i) => {'recorded_at': '2026-07-11T0$i:00:00.000Z', 'lat': 0.0, 'lng': 0.0}),
  };

  final dashboard = {
    'collection': {
      'mtd_amount': 40000,
      'today_amount': 5000,
      'target_amount': 100000,
      'target_pct': 40.0,
    },
  };

  final trail = {
    'ptps_created': 3,
    'ptps_kept': 2,
    'ptps_broken': 0,
    'ptps_pending': 1,
    'ptps_pending_value': 3000,
    'ptp_conversion_pct': 100.0,
    'escalated_count': 0,
  };

  Future<void> pumpScreen(WidgetTester tester, {bool hasAttendanceToday = true}) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feAttendanceProvider.overrideWith((ref) async => hasAttendanceToday ? attendance : null),
          feRouteProvider.overrideWith((ref) async => hasAttendanceToday ? route : null),
          feDashboardProvider.overrideWith((ref) async => dashboard),
          feTrailProvider.overrideWith((ref) async => trail),
        ],
        child: const MaterialApp(home: FieldExecutiveDashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders attendance, route, target, receipts, and PTP summary', (tester) async {
    await pumpScreen(tester);

    expectStat(tester, 'Status', 'On Duty');
    expectStat(tester, "Today's Distance", '4.2 km');
    expectStat(tester, 'GPS Pings', '12');

    // Receipts: 6 visits, 5 with photo, 4 with signature.
    expectStat(tester, 'Receipts Generated', '6');
    expectStat(tester, 'With Photo', '5');
    expectStat(tester, 'With Signature', '4');

    // Target progress: 40,000 of 100,000 = 40%.
    expectStat(tester, 'Collected MTD', '₹ 0.40L');
    final targetCard = tester.widget<DashboardStatCard>(
      find.byWidgetPredicate((w) => w is DashboardStatCard && w.label == 'Target'),
    );
    expect(targetCard.value, '₹ 1.00L');
    expect(targetCard.sub, '40% achieved');

    // PTP created/kept/broken.
    expectStat(tester, 'Created', '3');
    expectStat(tester, 'Kept', '2');
    expectStat(tester, 'Broken', '0');
  });

  testWidgets('documents the Visits Planned and Customer Location gaps rather than guessing', (tester) async {
    await pumpScreen(tester);

    expect(find.text('Visits Planned'), findsOneWidget);
    expect(find.textContaining('No distinct visit-queue exists'), findsOneWidget);
    expect(find.text('Customer Location'), findsOneWidget);
    expect(find.textContaining('no registered customer address'), findsOneWidget);
  });

  testWidgets('handles no attendance record for today yet', (tester) async {
    await pumpScreen(tester, hasAttendanceToday: false);

    expect(find.text('No attendance record for today yet'), findsOneWidget);
  });
}
