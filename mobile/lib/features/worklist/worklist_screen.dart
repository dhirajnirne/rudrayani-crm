import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/customer.dart';
import 'worklist_provider.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class WorklistScreen extends ConsumerStatefulWidget {
  const WorklistScreen({super.key});

  @override
  ConsumerState<WorklistScreen> createState() => _WorklistScreenState();
}

class _WorklistScreenState extends ConsumerState<WorklistScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final wl = ref.watch(worklistProvider);
    final user = auth.user;
    final userName = user?['full_name'] ?? 'Agent';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF00535B),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Today\'s Worklist', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(userName, style: const TextStyle(fontSize: 12, color: Colors.white70)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(worklistProvider),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by name, loan number or mobile…',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 12),
              ),
              onChanged: (v) => setState(() => _search = v.toLowerCase()),
            ),
          ),
          Expanded(
            child: wl.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Colors.red),
                    const SizedBox(height: 8),
                    Text('Error: $e'),
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: () => ref.invalidate(worklistProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (customers) {
                final filtered = _search.isEmpty
                    ? customers
                    : customers.where((c) =>
                        c.customerName.toLowerCase().contains(_search) ||
                        c.loanNumber.toLowerCase().contains(_search) ||
                        c.mobileNumber.contains(_search)).toList();

                if (filtered.isEmpty) {
                  return const Center(child: Text('No customers assigned today.'));
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(worklistProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) => _CustomerCard(customer: filtered[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Log out')),
        ],
      ),
    );
    if (ok == true && mounted) {
      await ref.read(authProvider.notifier).logout();
      // ignore: use_build_context_synchronously
      if (mounted) context.go('/login');
    }
  }
}

class _CustomerCard extends StatelessWidget {
  final Customer customer;
  const _CustomerCard({required this.customer});

  @override
  Widget build(BuildContext context) {
    final hasPtp = customer.ptpDate != null;
    final ptpDue = hasPtp && customer.ptpDate!.isBefore(DateTime.now().add(const Duration(days: 1)));

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: ptpDue ? Colors.orange : const Color(0xFF00535B),
          child: Icon(
            ptpDue ? Icons.schedule : Icons.person,
            color: Colors.white,
            size: 20,
          ),
        ),
        title: Text(
          customer.customerName,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${customer.loanNumber} · ${customer.companyName}', style: const TextStyle(fontSize: 12)),
            if (customer.dueAmount != null)
              Text(
                'Due: ${_rupee.format(customer.dueAmount)}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
            if (customer.lastResultCode != null)
              Text('Last: ${customer.lastResultCode}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
            if (hasPtp)
              Text(
                'PTP: ${_rupee.format(customer.ptpAmount)} on ${DateFormat('dd MMM').format(customer.ptpDate!)}',
                style: TextStyle(fontSize: 11, color: ptpDue ? Colors.orange : Colors.green),
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/customer/${customer.id}', extra: customer),
      ),
    );
  }
}
