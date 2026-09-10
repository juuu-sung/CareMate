import unittest

from app.rules.code_generator import generate_link_code


class LinkCodeGeneratorTest(unittest.TestCase):
    def test_generates_eight_character_alphanumeric_code(self) -> None:
        code = generate_link_code()

        self.assertEqual(len(code), 8)
        self.assertTrue(code.isalnum())

    def test_generates_distinct_codes(self) -> None:
        self.assertGreater(len({generate_link_code() for _ in range(50)}), 45)


if __name__ == "__main__":
    unittest.main()
