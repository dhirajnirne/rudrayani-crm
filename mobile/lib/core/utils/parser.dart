double? parseDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  if (value is String) {
    if (value.trim().isEmpty) return null;
    return double.tryParse(value);
  }
  return null;
}

int? parseInt(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toInt();
  if (value is String) {
    if (value.trim().isEmpty) return null;
    return int.tryParse(value);
  }
  return null;
}
