import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../team/team_screen.dart';
import '../worklist/worklist_screen.dart';

/// Role-aware landing (brief §3, §10): agents land straight on the worklist;
/// a Team Leader gets the toggle view — My Worklist / My Team tabs.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final isTL = ref.watch(authProvider.select((s) => s.user?['is_team_leader'] == true));
    if (!isTL) return const WorklistScreen();

    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: const [WorklistScreen(), TeamScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        indicatorColor: const Color(0xFF00535B).withValues(alpha: 0.15),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.list_alt), label: 'My Worklist'),
          NavigationDestination(icon: Icon(Icons.groups), label: 'My Team'),
        ],
      ),
    );
  }
}
