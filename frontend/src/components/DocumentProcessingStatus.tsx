import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getFirestore, collection, query, onSnapshot, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Document {
  id: string;
  documentType: string;
  status: string;
  name: string;
  error?: string;
}

interface DocumentProcessingStatusProps {
  onProcessingComplete?: () => void;
}

const DocumentProcessingStatus: React.FC<DocumentProcessingStatusProps> = ({ onProcessingComplete }) => {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isFormatting, setIsFormatting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  
  const db = getFirestore();
  const functions = getFunctions();

  // Listen for document status changes
  useEffect(() => {
    if (!currentUser) return;
    
    const userDocRef = doc(db, 'users', currentUser.uid);
    const documentsRef = collection(userDocRef, 'documents');
    const q = query(documentsRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Document[] = [];
      snapshot.forEach(doc => {
        docs.push({
          id: doc.id,
          ...doc.data() as Omit<Document, 'id'>
        });
      });
      
      setDocuments(docs);
      
      // Check if all documents are processed
      const allProcessed = docs.length > 0 && docs.every(doc => doc.status === 'processed');
      if (allProcessed && onProcessingComplete) {
        onProcessingComplete();
      }
    });
    
    return () => unsubscribe();
  }, [currentUser, db, onProcessingComplete]);

  // Count documents by status
  const documentCounts = {
    uploaded: documents.filter(doc => doc.status === 'uploaded').length,
    extracted: documents.filter(doc => doc.status === 'extracted').length,
    processed: documents.filter(doc => doc.status === 'processed').length,
    error: documents.filter(doc => doc.status === 'error').length
  };

  // Count documents by type
  const documentTypeCount = {
    syllabus: documents.filter(doc => doc.documentType === 'syllabus').length,
    transcript: documents.filter(doc => doc.documentType === 'transcript').length,
    grades: documents.filter(doc => doc.documentType === 'grades').length
  };

  // Check if we have the minimum required documents
  const hasSyllabus = documentTypeCount.syllabus > 0;
  // We'll keep this comment to document what we're checking, but remove the unused variable
  // const hasGradesOrTranscript = documentTypeCount.transcript > 0 || documentTypeCount.grades > 0;
  const hasMinimumDocuments = hasSyllabus;

  // Handle manual formatting
  const handleFormatDocuments = async () => {
    if (!currentUser) return;
    
    setIsFormatting(true);
    setError(null);
    setStatus('Formatting documents...');
    
    try {
      const formatDocumentsData = httpsCallable(functions, 'formatDocumentsData');
      const result = await formatDocumentsData({});
      
      if ((result.data as any).success) {
        setStatus('Documents formatted successfully');
      } else {
        setError((result.data as any).message || 'Failed to format documents');
      }
    } catch (err: any) {
      console.error('Error formatting documents:', err);
      setError(`Formatting failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsFormatting(false);
    }
  };

  // Handle document processing retry
  const handleRetryProcessing = async (documentId: string) => {
    if (!currentUser) return;
    
    setStatus(`Retrying processing for document ${documentId}...`);
    setError(null);
    
    try {
      // We'll use the formatDocumentsData function to process all documents
      const formatDocumentsData = httpsCallable(functions, 'formatDocumentsData');
      const result = await formatDocumentsData({});
      
      if ((result.data as any).success) {
        setStatus('Document processing initiated successfully');
      } else {
        setError((result.data as any).message || 'Failed to process document');
      }
    } catch (err: any) {
      console.error('Error processing document:', err);
      setError(`Processing failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Calculate overall progress
  const calculateProgress = () => {
    if (documents.length === 0) return 0;
    
    const totalSteps = documents.length * 2; // Upload + Process for each document
    let completedSteps = 0;
    
    documents.forEach(doc => {
      // Count upload step for all documents
      completedSteps += 1;
      
      // Count processing step for extracted or processed documents
      if (doc.status === 'extracted' || doc.status === 'processed') {
        completedSteps += 1;
      }
    });
    
    return Math.round((completedSteps / totalSteps) * 100);
  };

  const progress = calculateProgress();
  const canFormat = documentCounts.extracted > 0 && !isFormatting;
  // We'll keep this comment to document what we're checking, but remove the unused variable
  // const hasErrors = documentCounts.error > 0;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Document Processing Status</h2>
      
      {error && <p style={styles.error}>{error}</p>}
      {status && <p style={styles.status}>{status}</p>}
      
      <div style={styles.progressContainer}>
        <div style={styles.progressBar}>
          <div 
            style={{
              ...styles.progressFill,
              width: `${progress}%`,
              backgroundColor: progress === 100 ? '#4caf50' : '#2196f3'
            }}
          />
        </div>
        <div style={styles.progressLabel}>{progress}% Complete</div>
      </div>
      
      <div style={styles.statusSummary}>
        <div style={styles.statusItem}>
          <span style={styles.statusLabel}>Uploaded</span>
          <span style={styles.statusCount}>{documentCounts.uploaded}</span>
        </div>
        <div style={styles.statusItem}>
          <span style={styles.statusLabel}>Extracted</span>
          <span style={styles.statusCount}>{documentCounts.extracted}</span>
        </div>
        <div style={styles.statusItem}>
          <span style={styles.statusLabel}>Processed</span>
          <span style={styles.statusCount}>{documentCounts.processed}</span>
        </div>
        <div style={styles.statusItem}>
          <span style={styles.statusLabel}>Errors</span>
          <span style={{
            ...styles.statusCount,
            color: documentCounts.error > 0 ? '#f44336' : 'inherit'
          }}>{documentCounts.error}</span>
        </div>
      </div>
      
      <div style={styles.documentTypeInfo}>
        <h3>Document Types</h3>
        <div style={styles.documentTypeList}>
          <div style={styles.documentTypeItem}>
            <span style={styles.documentTypeLabel}>Syllabus</span>
            <span style={styles.documentTypeCount}>{documentTypeCount.syllabus}</span>
            {!hasSyllabus && <span style={styles.documentTypeWarning}>Required</span>}
          </div>
          <div style={styles.documentTypeItem}>
            <span style={styles.documentTypeLabel}>Transcript</span>
            <span style={styles.documentTypeCount}>{documentTypeCount.transcript}</span>
          </div>
          <div style={styles.documentTypeItem}>
            <span style={styles.documentTypeLabel}>Grades</span>
            <span style={styles.documentTypeCount}>{documentTypeCount.grades}</span>
          </div>
        </div>
        
        {!hasMinimumDocuments && (
          <p style={styles.warningMessage}>
            You need to upload at least a syllabus document to enable processing.
          </p>
        )}
      </div>
      
      {canFormat && (
        <button 
          onClick={handleFormatDocuments} 
          style={styles.formatButton}
          disabled={isFormatting}
        >
          {isFormatting ? 'Formatting...' : 'Format Documents'}
        </button>
      )}
      
      {documents.length > 0 && (
        <div style={styles.documentsList}>
          <h3>Document Details</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Name</th>
                <th style={styles.tableHeader}>Type</th>
                <th style={styles.tableHeader}>Status</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} style={styles.tableRow}>
                  <td style={styles.tableCell}>{doc.name || 'Unnamed document'}</td>
                  <td style={styles.tableCell}>{doc.documentType}</td>
                  <td style={styles.tableCell}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: doc.status === 'processed' ? '#4caf50' : 
                                      doc.status === 'extracted' ? '#ff9800' :
                                      doc.status === 'error' ? '#f44336' : '#2196f3'
                    }}>
                      {doc.status}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    {doc.status === 'uploaded' && (
                      <button
                        onClick={() => handleRetryProcessing(doc.id)}
                        style={styles.actionButton}
                      >
                        Process Document
                      </button>
                    )}
                    {doc.status === 'error' && (
                      <button
                        onClick={() => handleRetryProcessing(doc.id)}
                        style={styles.actionButton}
                      >
                        Retry Processing
                      </button>
                    )}
                    {doc.error && (
                      <div style={styles.errorMessage}>
                        Error: {doc.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  title: {
    marginTop: 0,
    color: '#333',
    borderBottom: '1px solid #eee',
    paddingBottom: '10px',
  },
  progressContainer: {
    marginTop: '20px',
    marginBottom: '20px',
  },
  progressBar: {
    height: '20px',
    backgroundColor: '#e0e0e0',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    textAlign: 'center' as const,
    marginTop: '5px',
    fontSize: '14px',
    color: '#666',
  },
  statusSummary: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
  },
  statusItem: {
    flex: '1 1 0',
    textAlign: 'center' as const,
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    margin: '5px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  statusLabel: {
    display: 'block',
    fontSize: '14px',
    color: '#666',
    marginBottom: '5px',
  },
  statusCount: {
    display: 'block',
    fontSize: '24px',
    fontWeight: 'bold' as const,
    color: '#333',
  },
  documentTypeInfo: {
    marginBottom: '20px',
  },
  documentTypeList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '10px',
  },
  documentTypeItem: {
    flex: '1 1 0',
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  documentTypeLabel: {
    fontSize: '14px',
    color: '#666',
  },
  documentTypeCount: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#333',
  },
  documentTypeWarning: {
    fontSize: '12px',
    color: '#f44336',
    marginTop: '5px',
  },
  warningMessage: {
    color: '#f44336',
    backgroundColor: '#ffebee',
    padding: '10px',
    borderRadius: '4px',
    marginTop: '10px',
  },
  formatButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    marginBottom: '20px',
  },
  documentsList: {
    marginTop: '20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginTop: '10px',
  },
  tableHeader: {
    textAlign: 'left' as const,
    padding: '10px',
    backgroundColor: '#f2f2f2',
    borderBottom: '1px solid #ddd',
  },
  tableRow: {
    borderBottom: '1px solid #eee',
  },
  tableCell: {
    padding: '10px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.8rem',
  },
  actionButton: {
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  errorMessage: {
    color: '#f44336',
    fontSize: '0.8rem',
    marginTop: '5px',
  },
  error: {
    color: '#f44336',
    backgroundColor: '#ffebee',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '15px',
  },
  status: {
    color: '#2196F3',
    backgroundColor: '#e3f2fd',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '15px',
  },
};

export default DocumentProcessingStatus;
