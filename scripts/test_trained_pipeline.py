import requests, json, time

img_path = 'datasets/processed/kaggle_road_damage/images/val/vlcsnap-00056.jpg'
url = 'http://127.0.0.1:8000/api/v1/analysis/image'

with open(img_path, 'rb') as f:
    files = {'file': ('road_inspection_damaged.jpg', f, 'image/jpeg')}
    res = requests.post(url, files=files)
    print('Upload response:', res.json())
    analysis_id = res.json()['analysis_id']

# Poll for completion
for i in range(30):
    time.sleep(1.5)
    res = requests.get(f'http://127.0.0.1:8000/api/v1/analysis/{analysis_id}/result')
    if res.status_code == 200:
        print('\n=== FULL ANALYSIS RESULT RECEIVED ===')
        data = res.json()
        print('Status:', data['status'])
        print('Model Ready:', data['model_ready'])
        print('Total Detections:', len(data['detections']))
        for d in data['detections'][:5]:
            conf = d['confidence'] * 100
            print(f"  - Defect: {d['class_name']} ({d['display_name']}) | Conf: {conf:.1f}% | Sev: {d['severity']['level']} ({d['severity']['score']}/100)")
            print(f"    BBox: {d['bbox']}")
            print(f"    Measurements: {d['measurements']['width_pixels']}x{d['measurements']['height_pixels']} px, Area: {d['measurements']['area_pixels']} px^2")
            print(f"    Limitation: {d['measurements']['limitation']}")
            print(f"    Causes: {[c['cause'] for c in d['possible_causes'][:2]]}")
            print(f"    Actions: {d['recommended_actions'][:2]}")
        print('\nSummary:')
        print('Overall Severity:', data['summary']['overall_severity'])
        print('Overall Score:', data['summary']['overall_severity_score'])
        print('Road Condition:', data['summary']['road_condition'])
        print('Immediate Action Required:', data['summary']['immediate_action_required'])
        print('Annotated Image URL:', data['annotated_image_url'])
        break
    else:
        print(f"Waiting ({res.status_code})...")
