import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../performance/performance_screen.dart';
import '../team/team_screen.dart';
import '../worklist/worklist_screen.dart';

/// Role-aware landing (brief §3, §10): agents get My Worklist / My
/// Performance tabs; a Team Leader additionally gets My Team.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final isTL = ref.watch(
      authProvider.select((s) => s.capabilities.contains('team_leader')),
    );

    final screens = [
      const WorklistScreen(),
      if (isTL) const TeamScreen(),
      const PerformanceScreen(),
    ];
    final destinations = [
      const NavigationDestination(
        icon: Icon(Icons.list_alt),
        label: 'My Worklist',
      ),
      if (isTL)
        const NavigationDestination(icon: Icon(Icons.groups), label: 'My Team'),
      const NavigationDestination(
        icon: Icon(Icons.insights),
        label: 'My Performance',
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        indicatorColor: const Color(0xFF00535B).withValues(alpha: 0.15),
        destinations: destinations,
      ),
    );
  }
}
