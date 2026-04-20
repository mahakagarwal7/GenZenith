import { extractTextFromImage } from '../processOCR';

jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    documentTextDetection: jest.fn().mockImplementation((imageUri: string) => {
      if (imageUri.includes('valid')) {
        return Promise.resolve([{
          fullTextAnnotation: {
            text: 'Urgent medical help needed at village X',
            pages: [{ confidence: 0.92 }]
          }
        }]);
      }
      return Promise.resolve([{ fullTextAnnotation: null }]);
    })
  }))
}));

describe('OCR Processor', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('extracts text and confidence from valid image URI', async () => {
    const result = await extractTextFromImage('gs://bucket/valid-image.png');
    expect(result.text).toBe('Urgent medical help needed at village X');
    expect(result.confidence).toBe(0.92);
  });

  it('returns empty result for missing image URI', async () => {
    const result = await extractTextFromImage('');
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });
});
