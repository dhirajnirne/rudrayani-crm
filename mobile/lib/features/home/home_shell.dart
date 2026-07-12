import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../dashboard/field_executive_dashboard_screen.dart';
import '../dashboard/team_leader_dashboard_screen.dart';
import '../dashboard/telecaller_dashboard_screen.dart';
import '../performance/performance_screen.dart';
import '../reminders/today_section.dart';
import '../team/team_screen.dart';
import '../worklist/worklist_screen.dart';
import 'more_menu_screen.dart';

/// Determines which role-specific shell to show based on capabilities.
/// Team Leader wins if multiple flags are somehow set.
enum DashboardRole { teamLeader, telecaller, fieldAgent }

DashboardRole? resolveDashboardRole(List<String> capabilities) {
  if (capabilities.contains('team_leader')) return DashboardRole.teamLeader;
  if (capabilities.contains('telecaller')) return DashboardRole.telecaller;
  if (capabilities.contains('field_agent')) return DashboardRole.fieldAgent;
  return null;
}

/// Mobile redesign phase 1: per-role bottom-nav shells replacing the shared tab layout.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final capabilities = ref.watch(authProvider.select((s) => s.capabilities));
    final role = resolveDashboardRole(capabilities);

    return switch (role) {
      DashboardRole.teamLeader => const _TeamLeaderShell(),
      DashboardRole.telecaller => const _TelecallerShell(),
      DashboardRole.fieldAgent => const _FieldAgentShell(),
      null => const Scaffold(body: Center(child: Text('No dashboard available for your role'))),
    };
  }
}

class _TelecallerShell extends ConsumerStatefulWidget {
  const _TelecallerShell();

  @override
  ConsumerState<_TelecallerShell> createState() => _TelecallerShellState();
}

class _TelecallerShellState extends ConsumerState<_TelecallerShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      const WorklistScreen(),
      const TelecallerDashboardScreen(),
      const PerformanceScreen(),
      const MoreMenuScreen(role: 'telecaller'),
    ];
    const destinations = [
      NavigationDestination(icon: Icon(Icons.list_alt), label: 'Home'),
      NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
      NavigationDestination(icon: Icon(Icons.insights), label: 'Performance'),
      NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
    ];

    return Scaffold(
      body: Column(
        children: [
          const TodaySection(heroMode: true),
          Expanded(child: IndexedStack(index: _tab, children: screens)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: destinations,
      ),
    );
  }
}

class _FieldAgentShell extends ConsumerStatefulWidget {
  const _FieldAgentShell();

  @override
  ConsumerState<_FieldAgentShell> createState() => _FieldAgentShellState();
}

class _FieldAgentShellState extends ConsumerState<_FieldAgentShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      const WorklistScreen(),
      const FieldExecutiveDashboardScreen(),
      const PerformanceScreen(),
      const MoreMenuScreen(role: 'field_agent'),
    ];
    const destinations = [
      NavigationDestination(icon: Icon(Icons.list_alt), label: 'Home'),
      NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
      NavigationDestination(icon: Icon(Icons.insights), label: 'Performance'),
      NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
    ];

    return Scaffold(
      body: Column(
        children: [
          const TodaySection(heroMode: true),
          Expanded(child: IndexedStack(index: _tab, children: screens)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: destinations,
      ),
    );
  }
}

class _TeamLeaderShell extends ConsumerStatefulWidget {
  const _TeamLeaderShell();

  @override
  ConsumerState<_TeamLeaderShell> createState() => _TeamLeaderShellState();
}

class _TeamLeaderShellState extends ConsumerState<_TeamLeaderShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      const TeamLeaderDashboardScreen(),
      const TeamScreen(),
      const PerformanceScreen(),
      const MoreMenuScreen(role: 'team_leader'),
    ];
    const destinations = [
      NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
      NavigationDestination(icon: Icon(Icons.groups), label: 'My Team'),
      NavigationDestination(icon: Icon(Icons.insights), label: 'Performance'),
      NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
    ];

    return Scaffold(
      body: Column(
        children: [
          const TodaySection(heroMode: true),
          Expanded(child: IndexedStack(index: _tab, children: screens)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: destinations,
      ),
    );
  }
}
