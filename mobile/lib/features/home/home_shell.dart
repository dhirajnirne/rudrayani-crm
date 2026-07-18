import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../dashboard/branch_manager_dashboard_screen.dart';
import '../dashboard/field_executive_dashboard_screen.dart';
import '../dashboard/team_leader_dashboard_screen.dart';
import '../dashboard/telecaller_dashboard_screen.dart';
import '../performance/performance_screen.dart';
import '../team/team_screen.dart';
import '../worklist/worklist_screen.dart';
import '../account/account_screen.dart';

/// Which role-specific dashboard tab (if any) a user's capability set maps
/// to. A user can only hold one of branch_manager/team_leader/telecaller/
/// field_agent as their primary "management/individual work" capability in
/// practice, but if more than one flag is somehow set, branch_manager wins
/// (widest scope) then team_leader then telecaller then field_agent -- the
/// same precedence scope.ts/resolveReportScope use server-side. A
/// branch_manager or team_leader who ALSO carries collections work
/// (agent_type set) still gets their own personal worklist "for free" --
/// WorklistScreen is unconditionally present in HomeShell's screens list
/// below regardless of role, so there's no separate dual-capability branch
/// needed here; only the management-tier dashboard tab is role-exclusive.
/// Extracted as a pure function (rather than inlined in build()) so the
/// branching itself has a fast, deterministic unit test independent of the
/// full widget tree (see test/home_shell_dashboard_role_test.dart) --
/// HomeShell's other tabs (WorklistScreen in particular) pull in Hive/
/// connectivity platform channels that make a full widget-tree mount
/// impractical for a routing-only test.
enum DashboardRole { teamLeader, branchManager, telecaller, fieldAgent }

DashboardRole? resolveDashboardRole(List<String> capabilities) {
  if (capabilities.contains('agency_admin') || capabilities.contains('operations_manager')) {
    return DashboardRole.teamLeader;
  }
  if (capabilities.contains('branch_manager')) return DashboardRole.branchManager;
  if (capabilities.contains('team_leader')) return DashboardRole.teamLeader;
  if (capabilities.contains('telecaller')) return DashboardRole.telecaller;
  if (capabilities.contains('field_agent')) return DashboardRole.fieldAgent;
  return null;
}

/// Role-aware landing (brief §3, §10; Phase 12: role-based dashboards).
/// Every role gets My Worklist / My Performance; a Team Leader additionally
/// gets My Team + a Team Dashboard, and a plain telecaller/field_agent gets
/// their own role-specific Dashboard tab.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final capabilities = ref.watch(authProvider.select((s) => s.capabilities));
    final role = resolveDashboardRole(capabilities);
    final isTL = role == DashboardRole.teamLeader;
    final isBranchManager = role == DashboardRole.branchManager;
    final isTelecaller = role == DashboardRole.telecaller;
    final isFieldAgent = role == DashboardRole.fieldAgent;

    final screens = [
      const WorklistScreen(),
      if (isBranchManager) const BranchManagerDashboardScreen(),
      if (isTL) const TeamLeaderDashboardScreen(),
      if (isTL) const TeamScreen(),
      if (isTelecaller) const TelecallerDashboardScreen(),
      if (isFieldAgent) const FieldExecutiveDashboardScreen(),
      const PerformanceScreen(),
      const AccountScreen(),
    ];
    final destinations = [
      const NavigationDestination(
        icon: Icon(Icons.list_alt),
        label: 'My Worklist',
      ),
      if (isBranchManager)
        const NavigationDestination(
          icon: Icon(Icons.apartment),
          label: 'Branch Dashboard',
        ),
      if (isTL)
        const NavigationDestination(
          icon: Icon(Icons.dashboard),
          label: 'Team Dashboard',
        ),
      if (isTL)
        const NavigationDestination(icon: Icon(Icons.groups), label: 'My Team'),
      if (isTelecaller)
        const NavigationDestination(
          icon: Icon(Icons.dashboard),
          label: 'Dashboard',
        ),
      if (isFieldAgent)
        const NavigationDestination(
          icon: Icon(Icons.dashboard),
          label: 'Dashboard',
        ),
      const NavigationDestination(
        icon: Icon(Icons.insights),
        label: 'My Performance',
      ),
      const NavigationDestination(
        icon: Icon(Icons.person),
        label: 'Account',
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        indicatorColor: AppColors.primary.withValues(alpha: 0.15),
        destinations: destinations,
      ),
    );
  }
}
