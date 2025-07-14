import React from 'react';
import { Container } from 'react-bootstrap';

const Footer = () => {
  return (
    <footer className="footer mt-auto py-3">
      <div className="footer-blue-bar"></div>
      <Container>
        <p>&copy; 2025 JSON Tools. All rights reserved.</p>
      </Container>
    </footer>
  );
};

export default Footer;