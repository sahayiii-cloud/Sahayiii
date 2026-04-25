from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime

def generate_pdf_report(data: dict, file_path: str):
    doc = SimpleDocTemplate(file_path)
    styles = getSampleStyleSheet()

    elements = []

    title = f"Daily Financial Report - {datetime.utcnow().date()}"
    elements.append(Paragraph(title, styles["Title"]))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph(f"Revenue: ₹{data['revenue']:,.2f}", styles["Normal"]))
    elements.append(Paragraph(f"Total Payments: ₹{data['payments']:,.2f}", styles["Normal"]))
    elements.append(Paragraph(f"Escrow Held: ₹{data['escrow']:,.2f}", styles["Normal"]))
    elements.append(Paragraph(f"Transactions: {data['transactions']}", styles["Normal"]))

    doc.build(elements)