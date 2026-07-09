import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'reminders_provider.dart';

final _rupee = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);
final _time = DateFormat('HH:mm');

/// Compact, collapsible strip of everything due today: manual reminders
/// (swipe/tap to mark done) plus PTPs due or overdue (read-only here — PTPs
/// are actioned by logging a new call, not marked done directly).
class TodaySection extends ConsumerStatefulWidget {
  const TodaySection({super.key});

  @override
  ConsumerState<TodaySection> createState() => _TodaySectionState();
}

class _TodaySectionState extends ConsumerState<TodaySection> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final reminders = ref.watch(remindersTodayProvider);
    final ptps = ref.watch(ptpsDueTodayProvider);

    final reminderCount = reminders.valueOrNull?.length ?? 0;
    final ptpCount = ptps.valueOrNull?.length ?? 0;
    final total = reminderCount + ptpCount;

    if (total == 0 && !reminders.isLoading && !ptps.isLoading) {
      return const SizedBox.shrink();
    }

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      color: const Color(0xFFFFF7E6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Column(
        children: [
          ListTile(
            dense: true,
            leading: const Icon(Icons.today, color: Color(0xFF00535B)),
            title: Text(
              total > 0 ? 'Due Today ($total)' : 'Due Today',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            trailing: IconButton(
              icon: Icon(_expanded ? Icons.expand_less : Icons.expand_more),
              onPressed: () => setState(() => _expanded = !_expanded),
            ),
            onTap: () => setState(() => _expanded = !_expanded),
          ),
          if (_expanded) ...[
            for (final r in reminders.valueOrNull ?? const [])
              _ReminderTile(reminder: r),
            for (final p in ptps.valueOrNull ?? const []) _PtpTile(ptp: p),
            const SizedBox(height: 4),
          ],
        ],
      ),
    );
  }
}

class _ReminderTile extends ConsumerWidget {
  final Map<String, dynamic> reminder;
  const _ReminderTile({required this.reminder});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remindAt = DateTime.parse(reminder['remind_at'] as String).toLocal();
    final customerName = reminder['customer_name'] as String?;
    final note = reminder['note'] as String?;

    return ListTile(
      dense: true,
      leading: const Icon(
        Icons.notifications_active,
        size: 18,
        color: Colors.orange,
      ),
      title: Text(
        customerName ?? (note?.isNotEmpty == true ? note! : 'Reminder'),
        style: const TextStyle(fontSize: 13),
      ),
      subtitle: Text(
        [
          _time.format(remindAt),
          if (customerName != null && note?.isNotEmpty == true) note,
        ].join(' · '),
        style: const TextStyle(fontSize: 11, color: Colors.grey),
      ),
      trailing: IconButton(
        icon: const Icon(Icons.check_circle_outline, size: 20),
        tooltip: 'Mark done',
        onPressed: () async {
          try {
            await ref
                .read(remindersControllerProvider)
                .markDone(reminder['id'] as String);
          } catch (_) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Could not update — try again when online'),
                ),
              );
            }
          }
        },
      ),
    );
  }
}

class _PtpTile extends StatelessWidget {
  final Map<String, dynamic> ptp;
  const _PtpTile({required this.ptp});

  @override
  Widget build(BuildContext context) {
    final promised = DateTime.parse(ptp['promised_date'] as String);
    final overdue = promised.isBefore(DateTime.now());
    final amount = (ptp['amount'] as num?)?.toDouble();

    return ListTile(
      dense: true,
      leading: Icon(
        Icons.schedule,
        size: 18,
        color: overdue ? Colors.red : Colors.orange,
      ),
      title: Text(
        ptp['customer_name'] as String? ?? '',
        style: const TextStyle(fontSize: 13),
      ),
      subtitle: Text(
        'PTP${amount != null ? ': ${_rupee.format(amount)}' : ''}'
        '${overdue ? ' · Overdue' : ''}',
        style: TextStyle(
          fontSize: 11,
          color: overdue ? Colors.red : Colors.grey,
        ),
      ),
    );
  }
}
