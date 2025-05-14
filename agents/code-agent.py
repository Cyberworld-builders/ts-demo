import os
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.document_loaders import DirectoryLoader

def index_codebase(directory: str, chroma_host: str, chroma_port: int):
    # Load all files from the directory recursively
    loader = DirectoryLoader(directory, glob="**/*.*")
    documents = loader.load()

    # Split documents into manageable chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    texts = text_splitter.split_documents(documents)

    # Initialize OpenAI embeddings
    embeddings = OpenAIEmbeddings()

    # Connect to ChromaDB
    vectorstore = Chroma(
        collection_name="codebase",
        embedding_function=embeddings,
        host=chroma_host,
        port=chroma_port
    )

    # Insert documents into the vector store
    vectorstore.add_documents(texts)

if __name__ == "__main__":
    # Define the directory to index and ChromaDB connection details
    codebase_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    chroma_host = os.getenv('CHROMADB_HOST', 'localhost')
    chroma_port = int(os.getenv('CHROMADB_PORT', 8000))

    # Index the codebase
    index_codebase(codebase_directory, chroma_host, chroma_port)
