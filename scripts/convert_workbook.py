"""Reproducible, stdlib-only XLSX conversion. Private imports never enter public assets."""
import argparse, copy, datetime as dt, json, pathlib, re, unicodedata, zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower()).strip('-')
def convert(path):
    z=zipfile.ZipFile(path)
    strings=[''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
    def sheet(i):
        cells={}
        for c in ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')).findall('.//s:c',NS):
            v=c.find('s:v',NS); f=c.find('s:f',NS)
            val=v.text if v is not None else ''
            if c.get('t')=='s': val=strings[int(val)]
            elif val:
                try: val=float(val); val=int(val) if val.is_integer() else val
                except ValueError: pass
            cells[c.get('r')]={'value':val,'formula':f.text if f is not None else None}
        return cells
    routine,library,lifts=sheet(2),sheet(3),sheet(1)
    def get(s,ref): return s.get(ref,{}).get('value','')
    def link(s,ref):
        f=s.get(ref,{}).get('formula') or ''
        m=re.search(r'HYPERLINK\("([^"]+)"',f)
        return m.group(1) if m else ''
    exercises=[]
    for col,cat in [('B','Squat'),('D','Hinge'),('F','Push'),('H','Pull'),('J','Overhead push'),('L','Core')]:
        for r in range(8,41):
            name=get(library,f'{col}{r}')
            if name:
                exercises.append({'id':slug(name),'name':name,'category':cat,'demoUrl':link(library,f'{chr(ord(col)+1)}{r}'),'animation':None})
    aliases={'cossack-squats':'cossack-squat','machine-hip-thurst':'machine-hip-thrust','push-ups':'standard-push-up','inverted-rows':'inverted-row','bird-dogs':'bird-dog'}
    ids={x['id']:x for x in exercises}
    days=[]; entries=[]; review=[]
    profiles={
      'cossack-squat':'cossack','barbell-back-squat':'squat','leg-press':'leg-press','bulgarian-split-squat':'split-squat',
      'quad-extensions':'leg-extension','walking-lunge':'lunge','hanging-leg-raise':'hanging-raise','standard-push-up':'pushup',
      'barbell-bench-press':'bench','incline-dumbbell-press':'incline','overhead-press-barbell-ohp':'overhead','chest-dips':'dip',
      'dumbbell-lateral-raise':'lateral','cable-tricep-extension':'triceps','cable-woodchopper':'woodchop','bird-dog':'bird-dog',
      'conventional-deadlift':'deadlift','machine-hip-thrust':'hip-thrust','romanian-deadlift-rdl':'rdl','seated-leg-curl':'leg-curl',
      'back-extension-hyperextension':'back-extension','inverted-row':'inverted-row','barbell-bent-over-row':'row',
      'pull-up':'pullup','seated-cable-row':'cable-row','lat-pulldown':'pulldown','face-pull':'facepull',
      'straight-arm-cable-pulldown':'straight-arm','pallof-press':'pallof'}
    def reps(ref):
        v=get(routine,ref)
        if isinstance(v,(float,int)) and v>40000:
            date=dt.datetime(1899,12,30)+dt.timedelta(days=v)
            result=f'{date.month}–{date.day}'
            review.append({'cell':ref,'stored':v,'recovered':result,'reason':'Excel m-d date conversion in reps column'})
            return result
        return str(v)
    for row in range(1,56):
        a=str(get(routine,f'A{row}'))
        if a.startswith('DAY '):
            days.append({'id':f'day-{len(days)+1}','name':a.split(' ',2)[2].replace('/',' / ').title(),'exercises':[]})
        elif days and get(routine,f'B{row}') and a not in ('Type','Movement Category') and row<46:
            raw=get(routine,f'B{row}'); eid=aliases.get(slug(raw),slug(raw))
            if eid not in ids: raise ValueError(f'Unknown exercise {raw}')
            ids[eid]['animation']=profiles[eid]
            p={'id':f'week-0-row-{row}','exerciseId':eid,'type':a,'sets':int(get(routine,f'D{row}') or 1),'reps':reps(f'E{row}'),'load':'','notes':'','superset':None,'sourceCell':f'Week 0!B{row}'}
            if get(routine,f'C{row}'):
                ssid=aliases.get(slug(get(routine,f'C{row}')),slug(get(routine,f'C{row}')))
                p['superset']={'exerciseId':ssid,'reps':reps(f'F{row}'),'load':str(get(routine,f'H{row}'))}
            days[-1]['exercises'].append(p)
            status={'YES':'complete','NO':'pending','Mod':'modified'}.get(get(routine,f'I{row}'),'pending')
            effort=get(routine,f'J{row}'); effort=int(str(effort).split(' ')[0]) if effort else None
            entries.append({'id':f'legacy-{row}','prescriptionId':p['id'],'exerciseId':eid,'status':status,'effort':effort,'notes':str(get(routine,f'K{row}')),'legacyLoad':str(get(routine,f'G{row}')),'sets':[{'reps':None,'load':'','done':False} for _ in range(p['sets'])]})
            if get(routine,f'G{row}')!='': review.append({'cell':f'G{row}','decision':'Private legacy result only; public prescription load left blank','value':get(routine,f'G{row}')})
    progression=[{'category':get(routine,f'A{r}'),'examples':get(routine,f'B{r}'),'conservative':get(routine,f'C{r}'),'standard':get(routine,f'D{r}')} for r in range(50,55)]
    data={'schemaVersion':1,'datasetId':'workbook-template','revisionId':'seed-v1','parentRevisionId':None,'exportedAt':'2026-10-19T00:00:00.000Z','exercises':exercises,'weeks':[{'id':'week-0','name':'Week 0','startDate':'2026-10-12','focus':'Muscle Building (Hypertrophy)','completed':False,'days':days}],'sessions':[],'strengthTests':[],'progression':progression}
    private=copy.deepcopy(data); private.update(datasetId='private-workbook',revisionId='private-workbook-v1')
    for day in days:
        pids={p['id'] for p in day['exercises']}
        private['sessions'].append({'id':f'legacy-{day["id"]}','weekId':'week-0','dayId':day['id'],'date':'2026-10-12','entries':[e for e in entries if e['prescriptionId'] in pids],'imported':True})
    # Preserve baseline and historical tests, but never invent missing tested loads.
    movement_ids=['barbell-back-squat','conventional-deadlift','barbell-bench-press','barbell-bent-over-row','overhead-press-barbell-ohp','hanging-leg-raise']
    for r,eid in zip(range(11,17),movement_ids):
        def excel_date(v): return (dt.datetime(1899,12,30)+dt.timedelta(days=v)).date().isoformat() if isinstance(v,(float,int)) else ''
        private['strengthTests'].append({'id':f'baseline-{r}','exerciseId':eid,'date':excel_date(get(lifts,f'D{r}')) or '2026-10-12','reps':int(get(lifts,f'E{r}') or 1),'load':float(get(lifts,f'F{r}') or 0),'notes':str(get(lifts,f'J{r}')),'baseline':True,'sourceName':str(get(lifts,f'C{r}'))})
    for r in range(29,32):
        eid=movement_ids[r-29]
        private['strengthTests'].append({'id':f'retest-{r}','exerciseId':eid,'date':excel_date(get(lifts,f'B{r}')),'reps':int(get(lifts,f'E{r}')),'load':float(get(lifts,f'F{r}')),'notes':str(get(lifts,f'J{r}')),'baseline':False,'sourceName':str(get(lifts,f'D{r}'))})
    report={'exerciseCount':len(exercises),'dayCount':len(days),'workoutExerciseCount':sum(len(d['exercises']) for d in days),'animatedExerciseCount':sum(bool(x['animation']) for x in exercises),'review':review,'notes':['Imported sessions are worksheet summaries, not evidence of individual completed sets.','Worksheet sessions and undated baselines use the week start as a placeholder date; individual workout dates were not recorded.','Baseline test rows without loads remain untested.','Historical retests are preserved, not treated as fresh measurements.']}
    return data,private,report

def main():
    p=argparse.ArgumentParser(); p.add_argument('--workbook',default=str(ROOT/'current_worksheet.xlsx')); p.add_argument('--public',action='store_true',help='Regenerate sanitized checked-in routine'); a=p.parse_args()
    data,private,report=convert(a.workbook)
    folder=ROOT/'.private'; folder.mkdir(exist_ok=True)
    (folder/'workbook-results.json').write_text(json.dumps(private,indent=2)+'\n')
    (folder/'conversion-review.json').write_text(json.dumps(report,indent=2)+'\n')
    if a.public: (ROOT/'src/data/routine.json').write_text(json.dumps(data,indent=2)+'\n')
    print(f'{report["dayCount"]} days, {report["exerciseCount"]} library exercises, {report["animatedExerciseCount"]} animated movements. Private data: .private/workbook-results.json')
if __name__=='__main__': main()
