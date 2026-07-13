import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../approvals/approvals_view.dart';

class ManagementApprovalsScreen extends ConsumerWidget {
  const ManagementApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Agency Approvals'),
      ),
      body: const ApprovalsView(groupByBranch: true),
    );
  }
}
