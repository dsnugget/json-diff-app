import React from 'react';
import { Navbar, Container, Form } from 'react-bootstrap';

const Header = ({ theme, toggleTheme, wrapTextEnabled, toggleWrapText }) => {
  return (
    <>
      <Navbar expand="lg" fixed="top" className="custom-header">
        <Container>
          <Navbar.Brand href="#" style={{ fontWeight: 'bold', fontSize: '1.5rem' }}>{`{ JSON Tools }`}</Navbar.Brand>
          <Form className="d-flex align-items-center" style={{ marginLeft: 'auto' }}>
            <Form.Check 
              type="switch"
              id="theme-switch"
              label={theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              checked={theme === 'dark'}
              onChange={toggleTheme}
            />
          </Form>
        </Container>
      </Navbar>
      </>
  );
};

export default Header;
