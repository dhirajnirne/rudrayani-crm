import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/customer.dart';
import '../../core/offline/offline_queue.dart';
import '../../core/tracking/attendance_provider.dart';
import '../../core/tracking/tracking_service.dart';
import '../reminders/today_section.dart';
import 'worklist_provider.dart';

final _rupee = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

class WorklistScreen extends ConsumerStatefulWidget {
  const WorklistScreen({super.key});

  @override
  ConsumerState<WorklistScreen> createState() => _WorklistScreenState();
}

class _WorklistScreenState extends ConsumerState<WorklistScreen> {
  String _search = '';

  @override
  void initState() {
    super.initState();
    // Resume/stop tracking to match the server's view of the shift.
    Future.microtask(() => ref.read(attendanceProvider.notifier).init());
  }

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
            const Text(
              'Today\'s Worklist',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Text(
              userName,
              style: const TextStyle(fontSize: 12, color: Colors.white70),
            ),
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
          const _DutyBanner(),
          const _SyncBanner(),
          const TodaySection(),
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by name, loan number or mobile…',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  vertical: 0,
                  horizontal: 12,
                ),
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
                    const Icon(
                      Icons.error_outline,
                      size: 48,
                      color: Colors.red,
                    ),
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
                    : customers
                          .where(
                            (c) =>
                                c.customerName.toLowerCase().contains(
                                  _search,
                                ) ||
                                c.loanNumber.toLowerCase().contains(_search) ||
                                c.mobileNumber.contains(_search),
                          )
                          .toList();

                if (filtered.isEmpty) {
                  return const Center(
                    child: Text('No customers assigned today.'),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(worklistProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) =>
                        _CustomerCard(customer: filtered[i]),
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
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      // Shift stays open server-side, but the service must not outlive the
      // session's tokens — punch out properly to close the shift.
      await TrackingService.stop();
      await ref.read(authProvider.notifier).logout();
      // ignore: use_build_context_synchronously
      if (mounted) context.go('/login');
    }
  }
}

/// Offline-queue state: how many actions are waiting to sync, and the last
/// permanent rejection if the server refused one (brief §8 offline mode).
class _SyncBanner extends ConsumerWidget {
  const _SyncBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = ref.watch(offlineQueueProvider);
    if (q.pending == 0 && q.lastError == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      color: q.lastError != null
          ? const Color(0xFFFDECEA)
          : const Color(0xFFFFF7E6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          Icon(
            q.lastError != null
                ? Icons.error_outline
                : Icons.cloud_upload_outlined,
            size: 16,
            color: q.lastError != null
                ? Colors.red.shade700
                : Colors.orange.shade800,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              q.lastError ??
                  (q.syncing
                      ? 'Syncing ${q.pending} offline action(s)…'
                      : '${q.pending} action(s) waiting to sync'),
              style: TextStyle(
                fontSize: 12,
                color: q.lastError != null
                    ? Colors.red.shade700
                    : Colors.orange.shade900,
              ),
            ),
          ),
          if (q.lastError != null)
            TextButton(
              onPressed: () =>
                  ref.read(offlineQueueProvider.notifier).clearError(),
              child: const Text('Dismiss', style: TextStyle(fontSize: 12)),
            )
          else if (!q.syncing)
            TextButton(
              onPressed: () => ref.read(offlineQueueProvider.notifier).flush(),
              child: const Text('Sync now', style: TextStyle(fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

/// Explicit duty/tracking state (brief §10: "punch-in starts the
/// location-tracking session; punch-out ends it. Make this explicit in the
/// UI, not implicit").
class _DutyBanner extends ConsumerWidget {
  const _DutyBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final att = ref.watch(attendanceProvider);
    final notifier = ref.read(attendanceProvider.notifier);
    final onDuty = att.punchedIn;

    return Container(
      width: double.infinity,
      color: onDuty ? const Color(0xFFE6F4EA) : const Color(0xFFF1F3F4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                onDuty ? Icons.gps_fixed : Icons.gps_off,
                size: 18,
                color: onDuty ? Colors.green.shade800 : Colors.grey.shade700,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      onDuty
                          ? 'On duty — location tracking active'
                          : 'Off duty',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: onDuty
                            ? Colors.green.shade800
                            : Colors.grey.shade800,
                      ),
                    ),
                    if (onDuty && att.punchInAt != null)
                      Text(
                        'Punched in at ${DateFormat('HH:mm').format(att.punchInAt!.toLocal())}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.green.shade700,
                        ),
                      ),
                  ],
                ),
              ),
              SizedBox(
                height: 36,
                child: att.busy
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16),
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : ElevatedButton(
                        onPressed: onDuty
                            ? notifier.punchOut
                            : notifier.punchIn,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: onDuty
                              ? Colors.red.shade700
                              : const Color(0xFF00535B),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                        ),
                        child: Text(onDuty ? 'Punch Out' : 'Punch In'),
                      ),
              ),
            ],
          ),
          if (att.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                att.error!,
                style: const TextStyle(fontSize: 12, color: Colors.red),
              ),
            ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  final Customer customer;
  const _CustomerCard({required this.customer});

  @override
  Widget build(BuildContext context) {
    final hasPtp = customer.ptpDate != null;
    final ptpDue =
        hasPtp &&
        customer.ptpDate!.isBefore(DateTime.now().add(const Duration(days: 1)));

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
            Text(
              '${customer.loanNumber} · ${customer.companyName}',
              style: const TextStyle(fontSize: 12),
            ),
            if (customer.dueAmount != null)
              Text(
                'Due: ${_rupee.format(customer.dueAmount)}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            if (customer.lastResultCode != null)
              Text(
                'Last: ${customer.lastResultCode}',
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
            if (hasPtp)
              Text(
                'PTP: ${_rupee.format(customer.ptpAmount)} on ${DateFormat('dd MMM').format(customer.ptpDate!)}',
                style: TextStyle(
                  fontSize: 11,
                  color: ptpDue ? Colors.orange : Colors.green,
                ),
              ),
            if (customer.normalizedPending)
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Text(
                  'Normalized this month (pending lender confirmation)',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.blue,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/customer/${customer.id}', extra: customer),
      ),
    );
  }
}
