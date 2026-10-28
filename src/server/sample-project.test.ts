import { describe, it, expect } from 'vitest';
import { getSampleProject, getSampleLayers, getSampleComponents } from './sample-project-data.js';
import { TokenEngine } from '../shared/tokens.js';

describe('Sample Studio Architecture Mapping Suite', () => {
  it('should define all 5 architectural layers including Verification & Test Harness', () => {
    const layers = getSampleLayers();
    expect(layers).toHaveLength(5);
    expect(layers[0].id).toBe('layer_0_native_storage');
    expect(layers[1].id).toBe('layer_1_ai_ml');
    expect(layers[2].id).toBe('layer_2_ipc_desktop');
    expect(layers[3].id).toBe('layer_3_studio_ui');
    expect(layers[4].id).toBe('layer_4_tests');
  });

  it('should map all 29 architectural components (24 source + 5 test harnesses) with valid priorities and API anatomies', () => {
    const components = getSampleComponents();
    expect(components).toHaveLength(29);

    // Verify all components have valid priority ordering
    for (let i = 0; i < components.length; i++) {
      expect(components[i].priority).toBe(i + 1);
      expect(components[i].files.length).toBeGreaterThan(0);
      expect(components[i].anatomy).toBeDefined();
    }

    // Verify Layer 4 test harness components
    const testComponents = components.filter((c) => c.layerId === 'layer_4_tests');
    expect(testComponents).toHaveLength(5);
    for (const tc of testComponents) {
      expect(tc.anatomy.callees.length).toBeGreaterThan(0);
    }
  });

  it('should satisfy 100% design token compliance across all sample components', () => {
    const project = getSampleProject();
    for (const component of project.components) {
      const compliance = TokenEngine.validateCompliance(component);
      expect(compliance.valid).toBe(true);
      expect(compliance.errors).toHaveLength(0);
    }
  });

  it('should track the active critical XMP write refusal gap', () => {
    const project = getSampleProject();
    const xmpComp = project.components.find((c) => c.id === 'comp_studio_xmp_engine');
    expect(xmpComp).toBeDefined();
    expect(xmpComp?.status).toBe('gap_detected');
    expect(xmpComp?.gaps).toHaveLength(1);
    expect(xmpComp?.gaps[0].severity).toBe('critical');
    expect(xmpComp?.gaps[0].resolved).toBe(false);
  });
});
