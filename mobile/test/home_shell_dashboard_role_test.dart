// Phase 12: role-based dashboards. home_shell.dart picks exactly one of the
// three new dashboard tabs (Team Leader / Telecaller / Field Executive)
// based on the signed-in user's capabilities, with team_leader taking
// precedence over telecaller over field_agent if more than one flag is
// somehow set. The branching itself is a pure function
// (resolveDashboardRole) precisely so it can be tested here without mounting
// the full HomeShell widget tree -- WorklistScreen (one of the other tabs)
// pulls in Hive/connectivity_plus platform channels that aren't mocked
// anywhere in this test suite, so a full-tree HomeShell widget test isn't
// practical; the per-screen rendering tests (team_leader_dashboard_test.dart
// etc.) cover the new screens themselves in isolation instead.
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/features/home/home_shell.dart';

void main() {
  group('resolveDashboardRole (home_shell.dart routing)', () {
    test('team_leader routes to the Team Leader dashboard', () {
      expect(resolveDashboardRole(['team_leader']), DashboardRole.teamLeader);
    });

    test('telecaller routes to the Telecaller dashboard', () {
      expect(resolveDashboardRole(['telecaller']), DashboardRole.telecaller);
    });

    test('field_agent routes to the Field Executive dashboard', () {
      expect(resolveDashboardRole(['field_agent']), DashboardRole.fieldAgent);
    });

    test('agency_admin / operations_manager get no role dashboard tab', () {
      expect(resolveDashboardRole(['agency_admin']), isNull);
      expect(resolveDashboardRole(['operations_manager']), isNull);
      expect(resolveDashboardRole([]), isNull);
    });

    test('team_leader takes precedence over telecaller and field_agent', () {
      expect(
        resolveDashboardRole(['team_leader', 'telecaller', 'field_agent']),
        DashboardRole.teamLeader,
      );
    });

    test('telecaller takes precedence over field_agent', () {
      expect(resolveDashboardRole(['telecaller', 'field_agent']), DashboardRole.telecaller);
    });
  });
}
