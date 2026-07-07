// Smoke test: the app boots and, with no stored session, lands on the login
// screen. Replaces the unmodified `flutter create` counter-app template test,
// which referenced a nonexistent MyApp widget and never actually ran against
// this app.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/main.dart';

void main() {
  testWidgets('boots to the login screen when no session is stored', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: RudrayaniApp()));
    await tester.pumpAndSettle();

    expect(find.text('Rudrayani CRM'), findsWidgets);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
