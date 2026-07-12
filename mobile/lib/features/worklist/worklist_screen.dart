import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/customer.dart';
import '../../core/offline/offline_queue.dart';
import '../../core/theme/app_theme.dart';
import '../../core/tracking/attendance_provider.dart';
import '../../core/tracking/tracking_service.dart';
import '../../core/widgets/state_views.dart';
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
  String? _bucketFilter;
  String? _companyFilter;
  String? _productFilter;

  @override
  void initState() {
    super.initState();
    // Resume/stop tracking to match the server's view of the shift.
    Future.microtask(() => ref.read(attendanceProvider.notifier).init());
  }

  List<Widget> _buildFilterChips(List<Customer> customers) {
    final buckets = <String>{'All Buckets'};
    final companies = <String>{'All Companies'};
    final products = <String>{'All Products'};

    for (final c in customers) {
      if (c.bucket != null) buckets.add(c.bucket!);
      if (c.companyName.isNotEmpty) companies.add(c.companyName);
      if (c.product != null) products.add(c.product!);
    }

    return [
      for (final b in buckets)
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: FilterChip(
            label: Text(b),
            selected: (b == 'All Buckets' && _bucketFilter == null) || _bucketFilter == b,
            onSelected: (_) => setState(() => _bucketFilter = b == 'All Buckets' ? null : b),
          ),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final wl = ref.watch(worklistProvider);
    final user = auth.user;
    final userName = user?['full_name'] ?? 'Agent';

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Today\'s Worklist',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Text(
              userName,
              style: TextStyle(
                fontSize: 12,
                color: AppColors.onPrimary.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(worklistProvider);
              ref.invalidate(dispositionCodesProvider);
            },
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
          if (wl.hasValue && wl.value != null)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: _buildFilterChips(wl.value ?? []),
              ),
            ),
          Expanded(
            child: wl.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                message: 'Could not load your worklist.\n$e',
                onRetry: () {
                  ref.invalidate(worklistProvider);
                  ref.invalidate(dispositionCodesProvider);
                },
              ),
              data: (customers) {
                var filtered = customers;

                // Apply search filter
                if (_search.isNotEmpty) {
                  filtered = filtered.where((c) =>
                    c.customerName.toLowerCase().contains(_search) ||
                    c.loanNumber.toLowerCase().contains(_search) ||
                    c.mobileNumber.contains(_search)
                  ).toList();
                }

                // Apply bucket filter
                if (_bucketFilter != null) {
                  filtered = filtered.where((c) => c.bucket == _bucketFilter).toList();
                }

                // Apply company filter
                if (_companyFilter != null) {
                  filtered = filtered.where((c) => c.companyName == _companyFilter).toList();
                }

                // Apply product filter
                if (_productFilter != null) {
                  filtered = filtered.where((c) => c.product == _productFilter).toList();
                }

                if (filtered.isEmpty) {
                  return const EmptyState(
                    icon: Icons.people_outline,
                    message: 'No customers assigned today.',
                    hint: 'Pull down to refresh once new accounts land.',
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(worklistProvider);
                    ref.invalidate(dispositionCodesProvider);
                  },
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
          ? AppColors.errorContainer
          : AppColors.warningContainer,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          Icon(
            q.lastError != null
                ? Icons.error_outline
                : Icons.cloud_upload_outlined,
            size: 16,
            color: q.lastError != null
                ? AppColors.errorStrong
                : AppColors.warningStrong,
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
                    ? AppColors.errorStrong
                    : AppColors.warningStrong,
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
      color: onDuty ? AppColors.successContainer : AppColors.neutralContainer,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                onDuty ? Icons.gps_fixed : Icons.gps_off,
                size: 18,
                color: onDuty
                    ? AppColors.successStrong
                    : AppColors.textSecondary,
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
                            ? AppColors.successStrong
                            : AppColors.textSecondary,
                      ),
                    ),
                    if (onDuty && att.punchInAt != null)
                      Text(
                        'Punched in at ${DateFormat('HH:mm').format(att.punchInAt!.toLocal())}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.successStrong,
                        ).tabular,
                      ),
                  ],
                ),
              ),
              SizedBox(
                // Explicit tap-target height (design brief: 48px strict
                // minimum on all buttons) — do not shrink below this.
                height: AppDimens.tapTarget,
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
                              ? AppColors.error
                              : AppColors.primary,
                          foregroundColor: AppColors.onPrimary,
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
                style: const TextStyle(fontSize: 12, color: AppColors.error),
              ),
            ),
        ],
      ),
    );
  }
}

class _CustomerCard extends ConsumerWidget {
  final Customer customer;
  const _CustomerCard({required this.customer});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppDimens.listRow),
        child: Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      customer.customerName,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${customer.loanNumber} · ${customer.companyName}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (customer.dueAmount != null)
                    Text(
                      _rupee.format(customer.dueAmount),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ).tabular,
                    ),
                  if (customer.bucket != null) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.primarySurface,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        customer.bucket!,
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(
              width: AppDimens.tapTarget,
              child: IconButton(
                icon: const Icon(Icons.call),
                onPressed: customer.mobileNumber.isNotEmpty
                    ? () => _dial(context, customer.mobileNumber)
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _dial(BuildContext context, String number) async {
    final uri = Uri(scheme: 'tel', path: number);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cannot open dialer')),
      );
    }
  }
}
