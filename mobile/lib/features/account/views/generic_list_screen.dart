import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme/app_theme.dart';

class GenericListScreen<T> extends ConsumerStatefulWidget {
  final String title;
  final String endpoint;
  final String dataKey;
  final Widget Function(T item) builder;
  final T Function(Map<String, dynamic>) parser;

  const GenericListScreen({
    super.key,
    required this.title,
    required this.endpoint,
    required this.dataKey,
    required this.builder,
    required this.parser,
  });

  @override
  ConsumerState<GenericListScreen<T>> createState() => _GenericListScreenState<T>();
}

class _GenericListScreenState<T> extends ConsumerState<GenericListScreen<T>> {
  List<T>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.get(widget.endpoint);
      final rawList = res.data[widget.dataKey] as List;
      if (mounted) {
        setState(() {
          _data = rawList.map((e) => widget.parser(e as Map<String, dynamic>)).toList();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _error != null
          ? Center(child: Text('Error: $_error', style: const TextStyle(color: AppColors.error)))
          : _data == null
              ? const Center(child: CircularProgressIndicator())
              : _data!.isEmpty
                  ? const Center(child: Text('No data found.'))
                  : ListView.builder(
                      itemCount: _data!.length,
                      itemBuilder: (context, i) => widget.builder(_data![i]),
                    ),
    );
  }
}
