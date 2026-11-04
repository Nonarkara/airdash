"""Behavioral guards for manuscript failure paths and alert outcome denominators."""
import importlib.util, json, math, os, sys, tempfile, unittest
from pathlib import Path
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'paper' / 'analysis'))

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

build = module('paper_build', ROOT / 'paper' / 'build.py')
a10 = module('a10', ROOT / 'paper' / 'analysis' / 'a10_alerts_enso_system.py')

class PaperMethods(unittest.TestCase):
    def test_missing_and_nonfinite_values_fail(self):
        for value in (None, float('nan'), float('inf'), -float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError): build.render('{{x|f1}}', {'x': value})
        with self.assertRaises(SystemExit): build.render('{{missing|f1}}', {})

    def test_reference_verification_is_enforced(self):
        refs = {'r': {'title': 'Fixture', 'year': 2026}}
        with self.assertRaises(SystemExit): build.bibliography(r'\citep{r}', refs, {'r': {'verified': False}})
        self.assertIn(r'\bibitem{r}', build.bibliography(r'\citep{r}', refs, {'r': {'verified': True}})[0])

    def test_missing_daily_outcomes_are_not_nonhits(self):
        class DB:
            def execute(self, sql):
                self.rows = [('2026-10-01T00:00:00Z', 's', 2, 40, 'air4thai'), ('2026-10-02T00:00:00Z', 's', 2, 40, 'air4thai')] if 'station_key' in sql else [('pm25_level',)]
                return self
            def fetchall(self): return self.rows
        original = (a10.live, a10.INPUTS, a10.a1.load)
        base = Path('/Volumes/Data/agent-scratch')
        with tempfile.TemporaryDirectory(prefix='airdash-paper-test-', dir=base) as td:
            Path(td, 'station_meta.json').write_text('{}')
            Path(td, 'station_daily.json').write_text(json.dumps([['s', '2026-10-01', 40]]))
            hours = {f'2026-10-{d:02}T{h:02}':40 for d in (1,2) for h in range(7,13)}
            try:
                a10.live=lambda:DB(); a10.INPUTS=td; a10.a1.load=lambda *args, **kwargs: {'s':hours}
                out=a10.alerts()['air4thai']
                self.assertEqual(out['persistent_ge3h_of_6']['n'],2)
                self.assertEqual(out['day_mean_gt37_5']['n'],1)
                self.assertEqual(out['day_mean_gt37_5']['missing'],1)
                self.assertEqual(out['day_mean_gt37_5']['share'],1)
            finally: a10.live,a10.INPUTS,a10.a1.load=original

if __name__ == '__main__': unittest.main()
