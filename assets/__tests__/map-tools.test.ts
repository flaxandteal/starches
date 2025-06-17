import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { addMarkerImage } from '../map-tools';
import { Map, Marker } from 'maplibre-gl';

// Mock maplibre-gl
vi.mock('maplibre-gl', () => ({
  Map: vi.fn(),
  Marker: vi.fn()
}));

describe('map-tools module', () => {
  let mockMap: {
    hasImage: Mock;
    addImage: Mock;
  };
  let mockMarkerElement: HTMLElement;
  let mockMarkerSvg: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock map
    mockMap = {
      hasImage: vi.fn().mockReturnValue(false),
      addImage: vi.fn()
    };

    // Setup mock marker SVG structure
    mockMarkerSvg = {
      width: { baseVal: { value: 27 } },
      height: { baseVal: { value: 41 } },
      children: [{
        children: [{}, { style: { fill: '' } }]
      }]
    };

    mockMarkerElement = {
      firstChild: mockMarkerSvg
    } as any;

    // Mock Marker constructor
    (Marker as any).mockImplementation(() => ({
      _element: mockMarkerElement
    }));

    // Mock XMLSerializer
    global.XMLSerializer = vi.fn().mockImplementation(() => ({
      serializeToString: vi.fn().mockReturnValue('<svg>marker</svg>')
    }));

    // Mock btoa
    global.btoa = vi.fn().mockReturnValue('base64string');

    // Mock Image constructor
    global.Image = vi.fn().mockImplementation((width: number, height: number) => {
      const img = {
        width,
        height,
        src: '',
        decode: vi.fn().mockResolvedValue(undefined)
      };
      return img;
    }) as any;
  });

  describe('addMarkerImage', () => {
    it('should add a new marker image to the map', async () => {
      await addMarkerImage(mockMap as any, 'custom-marker');

      expect(mockMap.hasImage).toHaveBeenCalledWith('custom-marker');
      expect(mockMap.addImage).toHaveBeenCalledWith(
        'custom-marker',
        expect.objectContaining({
          width: 27,
          height: 41,
          src: 'data:image/svg+xml;base64,base64string'
        })
      );
    });

    it('should use default name when not provided', async () => {
      await addMarkerImage(mockMap as any);

      expect(mockMap.hasImage).toHaveBeenCalledWith('marker-new');
      expect(mockMap.addImage).toHaveBeenCalledWith(
        'marker-new',
        expect.any(Object)
      );
    });

    it('should apply custom color to marker', async () => {
      await addMarkerImage(mockMap as any, 'colored-marker', '#ff0000');

      expect(mockMarkerSvg.children[0].children[1].style.fill).toBe('#ff0000');
      expect(mockMap.addImage).toHaveBeenCalled();
    });

    it('should not add image if it already exists', async () => {
      mockMap.hasImage.mockReturnValue(true);

      await addMarkerImage(mockMap as any, 'existing-marker');

      expect(mockMap.hasImage).toHaveBeenCalledWith('existing-marker');
      expect(mockMap.addImage).not.toHaveBeenCalled();
    });

    it('should create proper data URL for marker', async () => {
      await addMarkerImage(mockMap as any, 'test-marker');

      const imageArg = mockMap.addImage.mock.calls[0][1];
      expect(imageArg.src).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(global.btoa).toHaveBeenCalledWith('<svg>marker</svg>');
    });

    it('should wait for image to decode before adding', async () => {
      const decodeMock = vi.fn().mockResolvedValue(undefined);
      global.Image = vi.fn().mockImplementation(() => ({
        width: 27,
        height: 41,
        src: '',
        decode: decodeMock
      })) as any;

      await addMarkerImage(mockMap as any, 'test-marker');

      expect(decodeMock).toHaveBeenCalled();
      expect(mockMap.addImage).toHaveBeenCalled();
    });

    it('should handle decode errors gracefully', async () => {
      const decodeError = new Error('Decode failed');
      global.Image = vi.fn().mockImplementation(() => ({
        width: 27,
        height: 41,
        src: '',
        decode: vi.fn().mockRejectedValue(decodeError)
      })) as any;

      await expect(addMarkerImage(mockMap as any, 'test-marker'))
        .rejects.toThrow('Decode failed');
    });

    it('should serialize marker SVG correctly', async () => {
      const serializeMock = vi.fn().mockReturnValue('<svg>custom</svg>');
      global.XMLSerializer = vi.fn().mockImplementation(() => ({
        serializeToString: serializeMock
      }));

      await addMarkerImage(mockMap as any, 'test-marker');

      expect(serializeMock).toHaveBeenCalledWith(mockMarkerSvg);
      expect(global.btoa).toHaveBeenCalledWith('<svg>custom</svg>');
    });

    it('should handle multiple color formats', async () => {
      const colors = ['#ff0000', 'rgb(255, 0, 0)', 'red', 'hsl(0, 100%, 50%)'];

      for (const color of colors) {
        vi.clearAllMocks();
        mockMap.hasImage.mockReturnValue(false);
        
        await addMarkerImage(mockMap as any, `marker-${color}`, color);
        
        expect(mockMarkerSvg.children[0].children[1].style.fill).toBe(color);
      }
    });
  });
});