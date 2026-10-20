import unittest
from pathlib import Path
from convert_workbook import convert

class WorkbookConversionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.public,cls.private,cls.report=convert(Path(__file__).resolve().parents[1]/'current_worksheet.xlsx')
    def test_content_counts(self):
        self.assertEqual(self.report['exerciseCount'],160)
        self.assertEqual(self.report['workoutExerciseCount'],30)
        self.assertEqual(self.report['animatedExerciseCount'],29)
    def test_excel_rep_recovery(self):
        recovered={r['cell']:r.get('recovered') for r in self.report['review'] if 'recovered' in r}
        self.assertEqual(recovered['E8'],'6–8')
        self.assertEqual(recovered['E9'],'10–12')
        self.assertEqual(recovered['E11'],'12–15')
        self.assertEqual(recovered['E29'],'5–6')
    def test_private_results_preserved_without_inventing_sets(self):
        entries=[e for s in self.private['sessions'] for e in s['entries']]
        back_squat=next(e for e in entries if e['exerciseId']=='barbell-back-squat')
        self.assertEqual(back_squat['legacyLoad'],'45')
        self.assertEqual(back_squat['notes'],'just practice the form')
        modified=next(e for e in entries if e['status']=='modified')
        self.assertEqual(modified['effort'],17)
        self.assertTrue(all(not s['done'] and s['reps'] is None for e in entries for s in e['sets']))
        self.assertEqual(len(self.private['strengthTests']),9)
    def test_public_privacy(self):
        self.assertEqual(self.public['sessions'],[])
        self.assertEqual(self.public['strengthTests'],[])
        self.assertTrue(all(not p['load'] and not p['notes'] for d in self.public['weeks'][0]['days'] for p in d['exercises']))

if __name__=='__main__': unittest.main()
